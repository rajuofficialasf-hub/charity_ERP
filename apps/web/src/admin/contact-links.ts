/** A tel: link of a number's digits only, so no other text reaches the dialler. */
export const telLink = (number: string) => `tel:${number.replace(/[^\d+]/g, '')}`;

/** A mailto: link with the address encoded, so it can add no recipient or text of its own. */
export const mailLink = (address: string) => `mailto:${encodeURIComponent(address)}`;
