const MINOR_PER_MAJOR = 100;

function toMinorUnits(amount) {
  return Math.round(Number(amount) * MINOR_PER_MAJOR);
}

function fromMinorUnits(amountMinor) {
  return Number(amountMinor) / MINOR_PER_MAJOR;
}

module.exports = {
  MINOR_PER_MAJOR,
  toMinorUnits,
  fromMinorUnits,
};
