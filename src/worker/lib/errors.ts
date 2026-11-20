export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CAPACITY_REACHED"
  | "SERIES_LIMIT"
  | "SERIES_CAPACITY_REACHED"
  | "SERIES_ALREADY_TRACKED"
  | "INVALID_SERIES_URL"
  | "FEED_UNAVAILABLE"
  | "FEED_TIMEOUT"
  | "FEED_INVALID"
  | "FEED_UNSUPPORTED"
  | "DESTINATION_LIMIT"
  | "DESTINATION_NOT_FOUND"
  | "DESTINATION_IN_USE"
  | "DESTINATION_EXISTS"
  | "DESTINATION_DISABLED"
  | "INVALID_WEBHOOK_URL"
  | "INVALID_ROLE_ID"
  | "WEBHOOK_DEAD"
  | "WEBHOOK_UNAVAILABLE"
  | "RATE_LIMITED"
  | "CROSS_ORIGIN"
  | "CRYPTO_INVALID"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const URL_PATTERN = /https?:\/\/\S+/gi;
const SNOWFLAKE_PATTERN = /\b\d{17,20}\b/g;

/** Remove anything that could leak a webhook URL or a Discord snowflake into a response or log. */
export function sanitizeMessage(message: string): string {
  return message.replace(URL_PATTERN, "[redacted]").replace(SNOWFLAKE_PATTERN, "[redacted]");
}

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly field?: string;

  constructor(code: ErrorCode, message: string, status = 400, field?: string) {
    super(sanitizeMessage(message));
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    if (field !== undefined) this.field = field;
  }
}

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    field?: string;
  };
}

export function toErrorBody(error: ApiError): ErrorBody {
  const body: ErrorBody = {
    error: {
      code: error.code,
      message: error.message,
    },
  };
  if (error.field !== undefined) body.error.field = error.field;
  return body;
}

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("INTERNAL_ERROR", "Something went wrong. Try again.", 500);
}
