package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/gorilla/websocket"
)

const (
	defaultHubURL = "http://192.168.0.6:8291"
	appVersion    = "0.14.0"
)

type Config struct {
	Hub   string `json:"hub"`
	Token string `json:"token"`
	Key   string `json:"key"`
	Name  string `json:"name"`
}

type ChannelSession struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	stderr io.ReadCloser
}

var (
	wsConn    *websocket.Conn
	wsWriteMu sync.Mutex
	channels  = make(map[uint32]*ChannelSession)
	chanMu    sync.Mutex
	logFile   *os.File
)

func main() {
	hubFlag := flag.String("hub", "", "Address of tTerm Web Hub (e.g. http://192.168.0.6:8291)")
	tokenFlag := flag.String("token", "", "One-time enrollment token")
	nameFlag := flag.String("name", "", "Computer name")
	daemonFlag := flag.Bool("daemon", false, "Run in background daemon mode")
	foregroundFlag := flag.Bool("foreground", false, "Run in foreground console for debugging")
	installFlag := flag.Bool("install", false, "Install to AppData, configure autostart, and run")
	uninstallFlag := flag.Bool("uninstall", false, "Remove from autostart and AppData")
	statusFlag := flag.Bool("status", false, "Display status of tTerm agent")
	flag.Parse()
	_ = installFlag

	userProfile := os.Getenv("USERPROFILE")
	if userProfile == "" {
		home, _ := os.UserHomeDir()
		userProfile = home
	}

	appDir := filepath.Join(userProfile, ".tterm-web")
	_ = os.MkdirAll(appDir, 0755)

	logPath := filepath.Join(appDir, "agent.log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err == nil {
		logFile = f
		if *daemonFlag {
			log.SetOutput(f)
		} else {
			log.SetOutput(io.MultiWriter(os.Stdout, f))
		}
	}

	if *statusFlag {
		showStatus(appDir, logPath)
		return
	}

	if *uninstallFlag {
		uninstallAgent(userProfile)
		return
	}

	cfg := loadOrInitConfig(appDir, *hubFlag, *tokenFlag, *nameFlag)

	// If explicit foreground mode requested, run agent loop directly in current console
	if *foregroundFlag {
		log.Printf("[tTerm Windows Agent v%s] Starting session (foreground)...", appVersion)
		log.Printf("[Config] Hub: %s | Computer: %s | Key: %s...", cfg.Hub, cfg.Name, safePrefix(cfg.Key, 8))
		runAgentLoop(cfg)
		return
	}

	// If not already in background daemon mode, configure autostart, copy to AppData and launch detached daemon
	if !*daemonFlag {
		installAndLaunchDaemon(cfg, appDir)
		return
	}

	// In daemon mode, ensure single running instance
	lockPath := filepath.Join(appDir, "daemon.pid")
	if prevData, err := os.ReadFile(lockPath); err == nil {
		var prevPID int
		if _, sErr := fmt.Sscanf(string(prevData), "%d", &prevPID); sErr == nil && prevPID > 0 && prevPID != os.Getpid() {
			chk := exec.Command("powershell.exe", "-NoProfile", "-Command", fmt.Sprintf("Get-Process -Id %d -ErrorAction SilentlyContinue", prevPID))
			if chk.Run() == nil {
				// Another daemon is already running happily
				return
			}
		}
	}
	_ = os.WriteFile(lockPath, []byte(fmt.Sprintf("%d\n", os.Getpid())), 0644)
	defer os.Remove(lockPath)

	log.Printf("[tTerm Windows Agent v%s] Starting session...", appVersion)
	log.Printf("[Config] Hub: %s | Computer: %s | Key: %s...", cfg.Hub, cfg.Name, safePrefix(cfg.Key, 8))

	runAgentLoop(cfg)
}

func safePrefix(s string, l int) string {
	if len(s) <= l {
		return s
	}
	return s[:l] + "..."
}

func loadOrInitConfig(appDir, hubArg, tokenArg, nameArg string) *Config {
	cfgPath := filepath.Join(appDir, "env.json")
	cfg := &Config{
		Hub: defaultHubURL,
	}

	if data, err := os.ReadFile(cfgPath); err == nil {
		_ = json.Unmarshal(data, cfg)
	}

	if hubArg != "" {
		cfg.Hub = hubArg
	}
	if cfg.Hub == "" {
		cfg.Hub = defaultHubURL
	}

	if tokenArg != "" {
		cfg.Token = tokenArg
	}

	if nameArg != "" {
		cfg.Name = nameArg
	}
	if cfg.Name == "" {
		host, err := os.Hostname()
		if err == nil && host != "" {
			cfg.Name = host
		} else {
			cfg.Name = "Windows-PC"
		}
	}

	if cfg.Key == "" {
		cfg.Key = generateSecureKey()
	}

	if cfg.Token == "" {
		tokenURL := fmt.Sprintf("%s/quick_token", strings.TrimRight(cfg.Hub, "/"))
		client := &http.Client{Timeout: 5 * time.Second}
		if resp, err := client.Get(tokenURL); err == nil && resp.StatusCode == 200 {
			var result struct {
				Token string `json:"token"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&result); err == nil && result.Token != "" {
				cfg.Token = result.Token
				log.Printf("[Setup] Acquired 1-click enrollment token from hub: %s...", safePrefix(cfg.Token, 8))
			}
			resp.Body.Close()
		}
	}

	// Persist
	if data, err := json.MarshalIndent(cfg, "", "  "); err == nil {
		_ = os.WriteFile(cfgPath, data, 0644)
	}

	return cfg
}

func generateSecureKey() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func installAndLaunchDaemon(cfg *Config, appDir string) {
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
	}

	installDir := filepath.Join(localAppData, "tTermAgent")
	_ = os.MkdirAll(installDir, 0755)

	targetExe := filepath.Join(installDir, "tterm-agent.exe")

	// Stop any previously running instance without killing current installer
	myPID := os.Getpid()
	psKillOthers := fmt.Sprintf(`Get-Process -Name "tterm-agent" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne %d } | Stop-Process -Force -ErrorAction SilentlyContinue`, myPID)
	_ = exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psKillOthers).Run()

	currentExe, err := os.Executable()
	if err == nil && filepath.Clean(currentExe) != filepath.Clean(targetExe) {
		time.Sleep(300 * time.Millisecond)
		_ = copyFile(currentExe, targetExe)
	}

	// Register in Windows Registry Run key for current user
	cmdReg := exec.Command("reg", "add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
		"/v", "tTermAgent", "/t", "REG_SZ", "/d", fmt.Sprintf("\"%s\" --daemon", targetExe), "/f")
	_ = cmdReg.Run()

	// Also add shortcut in Startup folder
	appData := os.Getenv("APPDATA")
	if appData != "" {
		startupLnk := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "tTermAgent.lnk")
		psScript := fmt.Sprintf(`$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut('%s'); $s.TargetPath = '%s'; $s.Arguments = '--daemon'; $s.WindowStyle = 7; $s.Save()`,
			startupLnk, targetExe)
		_ = exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript).Run()
	}

	// Clean up any legacy start_agent.vbs
	vbsLegacy := filepath.Join(appDir, "start_agent.vbs")
	_ = os.Remove(vbsLegacy)

	// Launch single detached background daemon via PowerShell Start-Process (independent desktop session process)
	psSpawn := fmt.Sprintf(`Start-Process -FilePath '%s' -ArgumentList '--daemon' -WindowStyle Hidden`, targetExe)
	_ = exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psSpawn).Run()

	msg := fmt.Sprintf("tTerm Windows Agent успешно установлен и подключен!\n\n"+
		"• Сервер: %s\n"+
		"• Имя компьютера: %s\n"+
		"• Автозапуск: включен (запускается в фоне при старте Windows)\n"+
		"• Установлен в: %s\n\n"+
		"Программа сейчас работает в фоновом режиме. Вы можете управлять этим компьютером из веб-интерфейса tTerm Web.",
		cfg.Hub, cfg.Name, targetExe)

	showNativeMessageBox("tTerm Windows Agent", msg)
	os.Exit(0)
}

func uninstallAgent(userProfile string) {
	_ = exec.Command("taskkill", "/F", "/IM", "tterm-agent.exe").Run()
	_ = exec.Command("reg", "delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "tTermAgent", "/f").Run()

	appData := os.Getenv("APPDATA")
	if appData != "" {
		startupLnk := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "tTermAgent.lnk")
		_ = os.Remove(startupLnk)
	}

	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData != "" {
		_ = os.RemoveAll(filepath.Join(localAppData, "tTermAgent"))
	}

	showNativeMessageBox("tTerm Windows Agent", "tTerm Windows Agent успешно удален из системы и автозапуска.")
}

func showStatus(appDir, logPath string) {
	cfgPath := filepath.Join(appDir, "env.json")
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		fmt.Println("tTerm Agent не настроен. Запустите tterm-agent.exe для автоматической настройки.")
		return
	}
	var cfg Config
	_ = json.Unmarshal(data, &cfg)

	fmt.Println("==================================================")
	fmt.Println("  tTerm Windows Agent Status")
	fmt.Println("==================================================")
	fmt.Printf("Компьютер: %s\n", cfg.Name)
	fmt.Printf("Сервер tTerm: %s\n", cfg.Hub)
	fmt.Printf("Ключ агента: %s\n", safePrefix(cfg.Key, 12))
	fmt.Printf("Файл логов: %s\n", logPath)
	fmt.Println("--------------------------------------------------")

	logBytes, err := os.ReadFile(logPath)
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(logBytes)), "\n")
		fmt.Println("Последние события:")
		start := 0
		if len(lines) > 8 {
			start = len(lines) - 8
		}
		for _, line := range lines[start:] {
			fmt.Printf("  %s\n", line)
		}
	}
	fmt.Println("==================================================")
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0755)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func showNativeMessageBox(title, message string) {
	if runtime.GOOS != "windows" {
		fmt.Printf("[%s] %s\n", title, message)
		return
	}
	user32 := syscall.NewLazyDLL("user32.dll")
	msgBox := user32.NewProc("MessageBoxW")
	tPtr, _ := syscall.UTF16PtrFromString(title)
	mPtr, _ := syscall.UTF16PtrFromString(message)
	// MB_OK (0) | MB_ICONINFORMATION (0x40) | MB_TOPMOST (0x40000)
	_, _, _ = msgBox.Call(0, uintptr(unsafe.Pointer(mPtr)), uintptr(unsafe.Pointer(tPtr)), 0x40040)
}

func runAgentLoop(cfg *Config) {
	backoff := 2 * time.Second
	maxBackoff := 30 * time.Second

	for {
		err := connectAndServe(cfg)
		if err != nil {
			log.Printf("[Connection] Disconnected: %v. Reconnecting in %v...", err, backoff)
		} else {
			backoff = 2 * time.Second
		}

		time.Sleep(backoff)
		backoff = backoff * 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func connectAndServe(cfg *Config) error {
	wsScheme := "ws"
	rawHub := cfg.Hub
	if strings.HasPrefix(rawHub, "https://") {
		wsScheme = "wss"
		rawHub = strings.TrimPrefix(rawHub, "https://")
	} else if strings.HasPrefix(rawHub, "http://") {
		rawHub = strings.TrimPrefix(rawHub, "http://")
	}

	wsURL := fmt.Sprintf("%s://%s/agent", wsScheme, rawHub)
	log.Printf("[Connecting] %s ...", wsURL)

	u, err := url.Parse(wsURL)
	if err != nil {
		return fmt.Errorf("invalid hub url: %w", err)
	}

	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 12 * time.Second

	conn, resp, err := dialer.Dial(u.String(), http.Header{})
	if err != nil {
		if resp != nil {
			return fmt.Errorf("dial failed with status %d: %w", resp.StatusCode, err)
		}
		return fmt.Errorf("dial failed: %w", err)
	}
	defer conn.Close()

	wsConn = conn

	// Handshake Hello
	username := os.Getenv("USERNAME")
	if username == "" {
		username = "user"
	}

	helloMsg := map[string]interface{}{
		"t":     "hello",
		"token": cfg.Token,
		"key":   cfg.Key,
		"name":  cfg.Name,
		"user":  username,
		"os":    "Windows",
		"agent": appVersion,
		"shell": "powershell.exe",
		"web":   2,
	}

	wsWriteMu.Lock()
	err = conn.WriteJSON(helloMsg)
	wsWriteMu.Unlock()
	if err != nil {
		return fmt.Errorf("send hello failed: %w", err)
	}

	log.Printf("[Connected] Hello handshake sent as %s. Waiting for messages...", cfg.Name)

	for {
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read error: %w", err)
		}

		switch msgType {
		case websocket.TextMessage:
			handleTextMessage(payload, cfg)
		case websocket.BinaryMessage:
			handleBinaryMessage(payload)
		case websocket.PingMessage:
			wsWriteMu.Lock()
			_ = conn.WriteMessage(websocket.PongMessage, nil)
			wsWriteMu.Unlock()
		}
	}
}

func handleTextMessage(data []byte, cfg *Config) {
	var msg map[string]interface{}
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	t, _ := msg["t"].(string)
	switch t {
	case "welcome":
		assignedName, _ := msg["name"].(string)
		log.Printf("[Welcome] Successfully authenticated with tTerm Web! Machine name: %s", assignedName)

	case "ping", "hb":
		wsWriteMu.Lock()
		if wsConn != nil {
			_ = wsConn.WriteJSON(map[string]string{"t": "hb"})
		}
		wsWriteMu.Unlock()

	case "run":
		var runID int64
		switch v := msg["id"].(type) {
		case float64:
			runID = int64(v)
		case int64:
			runID = v
		case int:
			runID = int64(v)
		}
		scriptText, _ := msg["script"].(string)
		go executeScriptRun(runID, scriptText)

	case "open":
		chFloat, ok := msg["ch"].(float64)
		if !ok {
			return
		}
		ch := uint32(chFloat)
		log.Printf("[Terminal] Opening channel %d (PowerShell)", ch)
		go openTerminalChannel(ch)

	case "close":
		chFloat, ok := msg["ch"].(float64)
		if !ok {
			return
		}
		ch := uint32(chFloat)
		log.Printf("[Terminal] Closing channel %d", ch)
		closeTerminalChannel(ch)
	}
}

func executeScriptRun(runID int64, script string) {
	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	outBytes, err := cmd.CombinedOutput()

	code := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			code = exitErr.ExitCode()
		} else {
			code = 1
		}
	}

	b64 := base64.StdEncoding.EncodeToString(outBytes)
	resp := map[string]interface{}{
		"t":    "ran",
		"id":   runID,
		"code": code,
		"out":  b64,
		"err":  "",
	}

	wsWriteMu.Lock()
	if wsConn != nil {
		_ = wsConn.WriteJSON(resp)
	}
	wsWriteMu.Unlock()
}

func openTerminalChannel(ch uint32) {
	chanMu.Lock()
	if existing, found := channels[ch]; found {
		_ = existing.cmd.Process.Kill()
		delete(channels, ch)
	}
	chanMu.Unlock()

	cmd := exec.Command("powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass")

	stdin, err := cmd.StdinPipe()
	if err != nil {
		log.Printf("Channel %d stdin error: %v", ch, err)
		return
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("Channel %d stdout error: %v", ch, err)
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		log.Printf("Channel %d stderr error: %v", ch, err)
		return
	}

	if err := cmd.Start(); err != nil {
		log.Printf("Channel %d start error: %v", ch, err)
		return
	}

	session := &ChannelSession{
		cmd:    cmd,
		stdin:  stdin,
		stdout: stdout,
		stderr: stderr,
	}

	chanMu.Lock()
	channels[ch] = session
	chanMu.Unlock()

	// Stream stdout -> websocket binary frame [1, chan_id (4B), data...]
	go streamPipeToWebSocket(ch, stdout)
	go streamPipeToWebSocket(ch, stderr)

	// Wait for process exit and notify server
	go func() {
		err := cmd.Wait()
		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = 1
			}
		}

		chanMu.Lock()
		delete(channels, ch)
		chanMu.Unlock()

		endedMsg := map[string]interface{}{
			"t":     "exit",
			"ch":    ch,
			"code":  exitCode,
			"error": "",
		}

		wsWriteMu.Lock()
		if wsConn != nil {
			_ = wsConn.WriteJSON(endedMsg)
		}
		wsWriteMu.Unlock()
		log.Printf("[Terminal] Channel %d finished (code: %d)", ch, exitCode)
	}()
}

func streamPipeToWebSocket(ch uint32, r io.Reader) {
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			// Binary frame: 1 (stdout) + 4 bytes big endian channel + data
			frame := make([]byte, 5+n)
			frame[0] = 1
			binary.BigEndian.PutUint32(frame[1:5], ch)
			copy(frame[5:], buf[:n])

			wsWriteMu.Lock()
			if wsConn != nil {
				_ = wsConn.WriteMessage(websocket.BinaryMessage, frame)
			}
			wsWriteMu.Unlock()
		}
		if err != nil {
			break
		}
	}
}

func handleBinaryMessage(frame []byte) {
	// Binary frame from core: [2 (1 byte), channel (4 bytes BE), stdin data...]
	if len(frame) < 5 || frame[0] != 2 {
		return
	}

	ch := binary.BigEndian.Uint32(frame[1:5])
	stdinData := frame[5:]

	chanMu.Lock()
	sess, exists := channels[ch]
	chanMu.Unlock()

	if exists && sess.stdin != nil {
		_, _ = sess.stdin.Write(stdinData)
	}
}

func closeTerminalChannel(ch uint32) {
	chanMu.Lock()
	sess, exists := channels[ch]
	if exists {
		delete(channels, ch)
	}
	chanMu.Unlock()

	if exists && sess.cmd != nil && sess.cmd.Process != nil {
		_ = sess.cmd.Process.Kill()
	}
}
