
function generateIdempotencyKey(){
    return crypto.randomUUID();
}
module.exports = generateIdempotencyKey;