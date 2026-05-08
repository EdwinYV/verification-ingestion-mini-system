class BaseError extends Error {
  constructor(message, statusCode, code, options = {}) {
    super(message, options);
    if (!code) {
      throw new Error('Error code is required');
    }
    this.statusCode = statusCode;
    this.code = code;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    if (options.details) {
      this.details = options.details;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends BaseError {
  constructor(message, code, options) {
    super(message, 400, code, options);
  }
}

class UnauthorizedError extends BaseError {
  constructor(message, code, options) {
    super(message, 401, code, options);
  }
}

class ForbiddenError extends BaseError {
  constructor(message, code, options) {
    super(message, 403, code, options);
  }
}

class NotFoundError extends BaseError {
  constructor(message, code, options) {
    super(message, 404, code, options);
  }
}

class RateLimitError extends BaseError {
  constructor(message, code, options) {
    super(message, 429, code, options);
  }
}

class PaymentRequiredError extends BaseError {
  constructor(message, code, options) {
    super(message, 402, code, options);
  }
}

class InternalError extends BaseError {
  constructor(message, code, options) {
    super(message, 500, code, options);
  }
}

module.exports = {
  BaseError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
  RateLimitError,
  InternalError,
};


