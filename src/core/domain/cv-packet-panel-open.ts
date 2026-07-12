/**
 * Pure open-state rules for the CV packet collapsible panel.
 *
 * forceOpen (empty/corrupt) must keep the editor visible, but must never
 * auto-close when the packet becomes valid mid-edit — that would drop focus.
 */

/** Panel must be forced open while the packet is empty or not plausible. */
export function cvPacketForceOpen(cvSummary: string, isPlausible: boolean): boolean {
  return !cvSummary.trim() || !isPlausible
}

/**
 * Effective open flag: forced open OR user preference.
 * Callers must latch userOpen=true when forceOpen becomes true (see latchCvPacketUserOpen).
 */
export function cvPacketPanelOpen(forceOpen: boolean, userOpen: boolean): boolean {
  return forceOpen || userOpen
}

/**
 * When forceOpen is true, userOpen must latch true so that when forceOpen later
 * clears, the panel stays open (sticky) until the user collapses it.
 */
export function latchCvPacketUserOpen(forceOpen: boolean, userOpen: boolean): boolean {
  return forceOpen ? true : userOpen
}
