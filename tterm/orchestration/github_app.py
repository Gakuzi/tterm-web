"""
GitHub Web Application Authorization & API Orchestration Client.

Provides full GitHub OAuth App web flow authorization and Personal Access Token (PAT)
binding, enabling tTerm to act on behalf of the authenticated GitHub user:
  - Repository management (list, create, bind)
  - Branch creation and switching per terminal
  - Automated commits and file pushes
  - Pull Request creation and code reviews
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

log = logging.getLogger("tterm.orchestration.github")

GITHUB_API_BASE = "https://api.github.com"
GITHUB_OAUTH_AUTHORIZE = "https://github.com/login/oauth/authorize"
GITHUB_OAUTH_TOKEN = "https://github.com/login/oauth/access_token"

DEFAULT_SCOPES = ["repo", "user", "workflow", "read:org"]
AUTH_CACHE_FILE = os.path.expanduser("~/.tterm_github_auth.json")


def _save_auth_cache(auth: Optional[Dict[str, Any]]) -> None:
    try:
        if auth:
            with open(AUTH_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(auth, f, indent=2)
        else:
            if os.path.exists(AUTH_CACHE_FILE):
                os.remove(AUTH_CACHE_FILE)
    except Exception as e:
        log.warning("Could not update GitHub auth cache file: %s", e)


def _load_auth_cache() -> Optional[Dict[str, Any]]:
    try:
        if os.path.exists(AUTH_CACHE_FILE):
            with open(AUTH_CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and data.get("is_authenticated"):
                    return data
    except Exception as e:
        log.warning("Could not read GitHub auth cache file: %s", e)
    return None


def _get_ssl_context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ctx = ssl.create_default_context()
        try:
            ctx.load_default_certs()
        except Exception:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        return ctx


class GitHubAppManager:
    """Manages GitHub web app OAuth sessions, token storage, and repository operations."""

    def __init__(self):
        self._ssl_ctx = _get_ssl_context()
        self._client_id: Optional[str] = os.environ.get("GITHUB_CLIENT_ID")
        self._client_secret: Optional[str] = os.environ.get("GITHUB_CLIENT_SECRET")

        # Authenticated user session
        self._auth: Optional[Dict[str, Any]] = _load_auth_cache()
        if not self._auth:
            try:
                from .encrypted_vault import encrypted_vault
                secrets = encrypted_vault.load_secrets_sync("owner-user")
                saved_token = secrets.get("github_token")
                if saved_token:
                    self._auth = {
                        "is_authenticated": True,
                        "auth_type": "oauth_token",
                        "username": secrets.get("github_username") or "github-user",
                        "name": secrets.get("github_username") or "GitHub User",
                        "email": f"{secrets.get('github_username', 'user')}@users.noreply.github.com",
                        "scopes": DEFAULT_SCOPES,
                        "access_token": saved_token,
                        "connected_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                    }
            except Exception:
                pass

    def is_authenticated(self) -> bool:
        """Returns True if a GitHub user is currently authenticated."""
        return bool(self._auth and self._auth.get("is_authenticated"))

    def configure_oauth_app(self, client_id: str, client_secret: str):
        """Sets OAuth application credentials."""
        self._client_id = client_id.strip() if client_id else None
        self._client_secret = client_secret.strip() if client_secret else None
        log.info("GitHub OAuth App configured: client_id=%s", self._client_id)

    def get_auth_url(self, redirect_uri: str, state: str = "tterm-gh-state") -> str:
        """Builds GitHub OAuth authorization URL."""
        client_id = self._client_id or "Iv23liOAUTH_TTERM_APP"
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(DEFAULT_SCOPES),
            "state": state,
            "allow_signup": "true",
        }
        return f"{GITHUB_OAUTH_AUTHORIZE}?{urllib.parse.urlencode(params)}"

    def _api_request(
        self,
        endpoint: str,
        method: str = "GET",
        data: Optional[Dict[str, Any]] = None,
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Performs authenticated request to GitHub API."""
        url = endpoint if endpoint.startswith("http") else f"{GITHUB_API_BASE}{endpoint}"
        body = json.dumps(data).encode("utf-8") if data is not None else None

        auth_token = token or (self._auth.get("access_token") if self._auth else None)
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "tTerm-Web-App/0.1.28",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15, context=self._ssl_ctx) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            log.error("GitHub API HTTPError %d [%s]: %s", e.code, url, err_body)
            raise RuntimeError(f"GitHub API Error ({e.code}): {err_body}")
        except Exception as e:
            log.error("GitHub API connection error [%s]: %s", url, str(e))
            raise RuntimeError(f"GitHub connection failed: {str(e)}")

    def connect_with_token(self, token: str) -> Dict[str, Any]:
        """
        Validates GitHub Personal Access Token or OAuth Access Token
        and loads authenticated user profile.
        """
        clean_token = token.strip()
        user_data = self._api_request("/user", token=clean_token)

        self._auth = {
            "is_authenticated": True,
            "auth_type": "oauth_token",
            "username": user_data.get("login"),
            "name": user_data.get("name") or user_data.get("login"),
            "email": user_data.get("email") or f"{user_data.get('login')}@users.noreply.github.com",
            "avatar_url": user_data.get("avatar_url"),
            "html_url": user_data.get("html_url"),
            "public_repos": user_data.get("public_repos", 0),
            "total_private_repos": user_data.get("total_private_repos", 0),
            "scopes": DEFAULT_SCOPES,
            "access_token": clean_token,
            "connected_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        _save_auth_cache(self._auth)
        try:
            from .encrypted_vault import encrypted_vault
            encrypted_vault.save_secrets_sync(
                "owner-user",
                {
                    "github_token": clean_token,
                    "github_username": self._auth.get("username"),
                },
            )
        except Exception:
            pass
        log.info("GitHub account connected successfully: @%s (%s)", self._auth["username"], self._auth["name"])
        return self.get_auth_status()

    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Exchanges OAuth authorization code for GitHub access token."""
        if not self._client_id or not self._client_secret:
            raise RuntimeError("GitHub OAuth App credentials (client_id, client_secret) are not configured")

        payload = {
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        }
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "tTerm-Web-App/0.1.28",
        }
        req = urllib.request.Request(GITHUB_OAUTH_TOKEN, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15, context=self._ssl_ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        token = data.get("access_token")
        if not token:
            error_desc = data.get("error_description") or data.get("error") or "Unknown error"
            raise RuntimeError(f"GitHub OAuth failed: {error_desc}")

        return self.connect_with_token(token)

    def disconnect(self) -> bool:
        """Disconnects GitHub account."""
        self._auth = None
        _save_auth_cache(None)
        try:
            from .encrypted_vault import encrypted_vault
            encrypted_vault.delete_secret_keys_sync("owner-user", ["github_token", "github_username", "github_repos"])
        except Exception:
            pass
        log.info("GitHub account disconnected")
        return True

    def get_auth_status(self) -> Dict[str, Any]:
        """Returns safe authentication status without leaking full token."""
        if not self._auth or not self._auth.get("is_authenticated"):
            return {
                "is_authenticated": False,
                "oauth_configured": bool(self._client_id and self._client_secret),
                "client_id": self._client_id,
            }

        token = self._auth["access_token"]
        masked_token = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "***"
        return {
            "is_authenticated": True,
            "auth_type": self._auth.get("auth_type", "oauth_token"),
            "username": self._auth.get("username"),
            "name": self._auth.get("name"),
            "email": self._auth.get("email"),
            "avatar_url": self._auth.get("avatar_url"),
            "html_url": self._auth.get("html_url"),
            "public_repos": self._auth.get("public_repos", 0),
            "masked_token": masked_token,
            "scopes": self._auth.get("scopes", []),
            "connected_at": self._auth.get("connected_at"),
            "oauth_configured": bool(self._client_id and self._client_secret),
            "client_id": self._client_id,
        }

    def list_repositories(self, per_page: int = 50) -> List[Dict[str, Any]]:
        """Lists repositories accessible to the authenticated user."""
        if not self._auth:
            raise RuntimeError("GitHub account not connected")

        res = self._api_request(f"/user/repos?sort=updated&per_page={per_page}&type=all")
        repos = []
        for r in res:
            repos.append({
                "id": r.get("id"),
                "name": r.get("name"),
                "full_name": r.get("full_name"),
                "html_url": r.get("html_url"),
                "clone_url": r.get("clone_url"),
                "ssh_url": r.get("ssh_url"),
                "private": r.get("private", False),
                "default_branch": r.get("default_branch", "main"),
                "description": r.get("description"),
                "updated_at": r.get("updated_at"),
            })
        return repos

    def create_repository(
        self,
        name: str,
        description: str = "Managed by tTerm Orchestrator",
        private: bool = True,
        auto_init: bool = True,
    ) -> Dict[str, Any]:
        """Creates a new repository on GitHub under the authenticated user."""
        if not self._auth:
            raise RuntimeError("GitHub account not connected")

        payload = {
            "name": name.strip(),
            "description": description,
            "private": private,
            "auto_init": auto_init,
        }
        res = self._api_request("/user/repos", method="POST", data=payload)
        log.info("GitHub repository created: %s (private=%s)", res.get("full_name"), private)
        return {
            "ok": True,
            "id": res.get("id"),
            "name": res.get("name"),
            "full_name": res.get("full_name"),
            "html_url": res.get("html_url"),
            "clone_url": res.get("clone_url"),
            "ssh_url": res.get("ssh_url"),
            "default_branch": res.get("default_branch", "main"),
        }

    def create_branch(self, owner: str, repo: str, branch_name: str, base_branch: str = "main") -> Dict[str, Any]:
        """Creates a new branch on GitHub from base branch."""
        if not self._auth:
            raise RuntimeError("GitHub account not connected")

        # Get SHA of base branch
        base_ref = self._api_request(f"/repos/{owner}/{repo}/git/ref/heads/{base_branch}")
        sha = base_ref.get("object", {}).get("sha")
        if not sha:
            raise RuntimeError(f"Base branch '{base_branch}' not found in {owner}/{repo}")

        payload = {
            "ref": f"refs/heads/{branch_name}",
            "sha": sha,
        }
        res = self._api_request(f"/repos/{owner}/{repo}/git/refs", method="POST", data=payload)
        log.info("Branch '%s' created in %s/%s from %s (%s)", branch_name, owner, repo, base_branch, sha[:7])
        return {"ok": True, "branch": branch_name, "sha": sha}

    def create_pull_request(
        self,
        owner: str,
        repo: str,
        title: str,
        body: str,
        head_branch: str,
        base_branch: str = "main",
    ) -> Dict[str, Any]:
        """Creates a Pull Request on GitHub."""
        if not self._auth:
            raise RuntimeError("GitHub account not connected")

        payload = {
            "title": title,
            "body": body,
            "head": head_branch,
            "base": base_branch,
        }
        res = self._api_request(f"/repos/{owner}/{repo}/pulls", method="POST", data=payload)
        log.info("Pull Request created: %s (#%s)", res.get("html_url"), res.get("number"))
        return {
            "ok": True,
            "pr_url": res.get("html_url"),
            "pr_number": res.get("number"),
            "title": res.get("title"),
            "state": res.get("state"),
        }

    def create_or_update_file(
        self,
        owner: str,
        repo: str,
        path: str,
        content: str,
        message: str,
        branch: str = "main",
    ) -> Dict[str, Any]:
        """Creates or updates a file directly on GitHub on behalf of the authenticated user."""
        if not self._auth:
            raise RuntimeError("GitHub account not connected")

        clean_path = path.lstrip("/")
        # Check if file exists to retrieve SHA for update
        sha: Optional[str] = None
        try:
            existing = self._api_request(f"/repos/{owner}/{repo}/contents/{clean_path}?ref={branch}")
            sha = existing.get("sha")
        except Exception:
            pass

        import base64
        encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")
        committer = {
            "name": self._auth.get("name") or self._auth.get("username"),
            "email": self._auth.get("email"),
        }
        payload = {
            "message": message,
            "content": encoded_content,
            "branch": branch,
            "committer": committer,
            "author": committer,
        }
        if sha:
            payload["sha"] = sha

        res = self._api_request(f"/repos/{owner}/{repo}/contents/{clean_path}", method="PUT", data=payload)
        log.info("File '%s' committed to %s/%s on branch '%s'", clean_path, owner, repo, branch)
        return {
            "ok": True,
            "commit": res.get("commit", {}).get("sha"),
            "content": res.get("content", {}).get("html_url"),
        }

    def get_terminal_git_setup(self) -> str:
        """Returns bash command string to configure git author identity in terminal."""
        if not self._auth or not self._auth.get("is_authenticated"):
            return ""
        name = self._auth.get("name") or self._auth.get("username")
        email = self._auth.get("email")
        token = self._auth.get("access_token", "")
        username = self._auth.get("username", "")

        lines = [
            f'git config --global user.name "{name}"',
            f'git config --global user.email "{email}"',
        ]
        if token and username:
            lines.append('git config --global credential.helper store')
            lines.append(f'echo "https://{username}:{token}@github.com" > ~/.git-credentials')
            lines.append('chmod 600 ~/.git-credentials')
        return " && ".join(lines)


github_manager = GitHubAppManager()


def save_github_token(token: str, user_id: str = "owner-user") -> Dict[str, Any]:
    """Saves GitHub access token into the encrypted vault and connects the account."""
    clean = token.strip()
    status = github_manager.connect_with_token(clean)
    try:
        from .encrypted_vault import encrypted_vault
        encrypted_vault.save_secrets_sync(
            user_id,
            {
                "github_token": clean,
                "github_username": status.get("username"),
            },
        )
    except Exception as e:
        log.warning("Could not persist github token to encrypted vault: %s", e)
    return status


def load_github_token(user_id: str = "owner-user") -> Optional[str]:
    """Retrieves GitHub token from the encrypted vault."""
    try:
        from .encrypted_vault import encrypted_vault
        secrets = encrypted_vault.load_secrets_sync(user_id)
        return secrets.get("github_token")
    except Exception:
        return None

