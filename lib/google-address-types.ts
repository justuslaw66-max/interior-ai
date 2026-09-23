export type GoogleAddressSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
};

export type GoogleResolvedAddress = {
  provider: "google";
  placeId: string;
  addressNormalized: string;
  formattedAddress: string;
  countryCode: string;
  postalCode: string;
  block: string;
  street: string;
  latitude: number | null;
  longitude: number | null;
};

export type GoogleAddressAutocompleteResponse = {
  suggestions: GoogleAddressSuggestion[];
  error?: string;
};

export type GoogleAddressResolveResponse = {
  address?: GoogleResolvedAddress;
  error?: string;
};
