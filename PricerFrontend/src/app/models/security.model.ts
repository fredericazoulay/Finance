export interface YahooSecurity {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
}

export interface SecuritySearchResponse {
  quotes?: YahooSecurity[];
}
