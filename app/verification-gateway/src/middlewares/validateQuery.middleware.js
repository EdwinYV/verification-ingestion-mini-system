const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { stripUnknown: true });
    if (error) {
      return res.status(400).json({
        status: 'error',
        message: error.details[0].message,
      });
    }
    req.validatedQuery = value;
    next();
  };
};

module.exports = validateQuery;
