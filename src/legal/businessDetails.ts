/**
 * The business behind the DARE TO GO IN brand, exactly as approved by its owner. One place, quoted by the Packages page, the payment
 * window and the transaction-details document; the Terms, the Privacy Policy and the Cancellation Policy (legalContent.ts) quote the same
 * values, and a test keeps them identical.
 *
 * OPEN ITEM — the business ADDRESS. Section 14C(a) of the Consumer Protection Law requires a remote seller to disclose "the address of
 * the dealer", and a tax invoice carries the dealer's address. Only the CITY has been approved for publication (no residential address);
 * the city alone has NOT been verified as meeting the requirement. `fullAddress` stays null and `addressStatus` stays 'open' until the owner
 * decides which address is published (checked with an accountant or the Consumer Protection Authority). Nothing here invents an address.
 */
export const BUSINESS = {
  brand: 'DARE TO GO IN',
  operatorHe: 'דפנה דלמדה',
  operatorEn: 'Dafna Dalmada',
  dealerTypeHe: 'עוסק מורשה',
  dealerTypeEn: 'licensed dealer',
  dealerNumber: '033868969',
  email: 'daretogoin@gmail.com',
  locationHe: 'קריית אונו, ישראל',
  locationEn: 'Kiryat Ono, Israel',
  fullAddress: null as string | null,
  addressStatus: 'open' as 'open' | 'decided',
} as const;

/** The one-line operator identification shown on the Packages page and in the payment window. */
export function operatorLine(language: 'he' | 'en'): string {
  return language === 'he'
    ? `${BUSINESS.brand} מופעל על ידי ${BUSINESS.operatorHe}, ${BUSINESS.dealerTypeHe} ${BUSINESS.dealerNumber}, ${BUSINESS.locationHe} · ${BUSINESS.email}`
    : `${BUSINESS.brand} is operated by ${BUSINESS.operatorEn}, ${BUSINESS.dealerTypeEn} ${BUSINESS.dealerNumber}, ${BUSINESS.locationEn} · ${BUSINESS.email}`;
}
