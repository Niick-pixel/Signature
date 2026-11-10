-- The consensus beside each release: ForexFactory's forecast and the
-- previous figure, as the calendar prints them ("150K", "0.3%"). Additive
-- only: two new, nullable columns; events already stored read as "not given".
-- Rollback: db/rollback/041_news_figures.sql (npm run migrate:rollback 041).
ALTER TABLE news_events ADD COLUMN forecast TEXT;
ALTER TABLE news_events ADD COLUMN previous TEXT;
