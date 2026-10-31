-- 0.1.16: the page in twelve languages. The one a person chose, kept with
-- them like the theme; NULL until they choose, and then the page shows the
-- language of the browser, when it is one of the twelve, or English.
ALTER TABLE users ADD COLUMN language text
    CHECK (language IN ('en', 'de', 'es', 'fr', 'it', 'pl', 'pt-BR', 'tr',
                        'ru', 'ja', 'ko', 'zh-CN'));
