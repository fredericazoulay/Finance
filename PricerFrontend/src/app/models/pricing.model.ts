export interface PriceResponse {
  request_id?: string;
  response_status?: string;
  security_id?: string;
  security_name?: string;
  product?: string;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface ProductOption {
  code: string;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type?: string;
  options?: string[];
}

export interface ChartPoint {
  cx: number;
  cy: number;
}
