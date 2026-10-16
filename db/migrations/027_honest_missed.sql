-- An honest Missed log. A missed trade only counts in stats if it was
-- written down before the move played out — as a Planned trade or a note.
-- Logged afterwards it is Hindsight: kept, shown, labelled, and left out of
-- every number. Null on every Missed trade logged before this question
-- existed, which reads as Hindsight (it was never shown to be otherwise).
ALTER TABLE trades ADD COLUMN written_before_outcome INTEGER
  CHECK (written_before_outcome IS NULL OR written_before_outcome IN (0,1));
