const MAX_SEARCH_TEXT_LENGTH = 2000;
const MAX_VALUE_LENGTH = 200;

const sanitizeResponsePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = JSON.parse(JSON.stringify(payload));
  if (clone.photo) {
    clone.photo = '[BASE64_IMAGE_TRUNCATED]';
  }
  return clone;
};

const flattenForSearch = (obj, depth = 0, out = []) => {
  if (!obj || depth > 3) return out;

  if (Array.isArray(obj)) {
    obj.forEach((item) => flattenForSearch(item, depth + 1, out));
    return out;
  }

  if (typeof obj === 'object') {
    Object.values(obj).forEach((value) => flattenForSearch(value, depth + 1, out));
    return out;
  }

  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    const str = String(obj).slice(0, MAX_VALUE_LENGTH);
    out.push(str);
  }

  return out;
};

const buildSearchText = (log) => {
  const parts = [
    log.searchId,
    log.verificationType,
    log.status,
    log.mode,
    log.provider,
  ].filter(Boolean);

  if (log.responsePayload) {
    const flattened = flattenForSearch(log.responsePayload);
    parts.push(...flattened);
  }

  return parts.join(' ').slice(0, MAX_SEARCH_TEXT_LENGTH);
};

const mapVerificationLogToDocument = (log) => {
  const base = typeof log.toObject === 'function' ? log.toObject() : log;
  const responsePayload = sanitizeResponsePayload(log.responsePayload);
  return {
    verificationId: log._id.toString(),
    verificationType: log.verificationType,
    searchId: log.searchId,
    mode: log.mode,
    status: log.status,
    provider: log.provider,
    clientOrganizationId: log.clientOrganizationId?.toString(),
    idempotencyKey: log.idempotencyKey,
    requestedAt: log.requestedAt || log.createdAt,
    completedAt: log.completedAt,
    errorMessage: log.errorMessage,
    searchText: buildSearchText({ ...base, responsePayload }),
    responsePayload,
  };
};

module.exports = {
  mapVerificationLogToDocument,
};
