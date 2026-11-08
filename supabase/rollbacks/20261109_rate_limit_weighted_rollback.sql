-- ROLLBACK of 20261109_rate_limit_weighted.sql. Run only AFTER the code that calls these functions is rolled back (otherwise the AI
-- extras fail closed: translation shows the original text, pattern reflections are "not available right now"; nothing else is affected).
drop function if exists public.take_rate_limit_weighted(text, integer, integer, integer);
drop function if exists public.peek_rate_limit(text, integer);
