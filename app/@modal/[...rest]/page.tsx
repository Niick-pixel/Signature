/**
 * The modal slot is empty everywhere except an intercepted /new. Each screen
 * matches it explicitly, so moving to another screen closes the window
 * instead of leaving it open over the new one.
 */
export default function NoModal() { return null; }
