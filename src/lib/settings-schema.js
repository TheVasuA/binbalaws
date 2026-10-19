// Portfolio / risk settings. Shared by the API (validation), the admin form
// (rendering) and every page that reads a limit, so there is exactly one
// definition of each setting.

export const SETTINGS_FIELDS = [
  {
    key: 'goalTarget',
    group: 'goal',
    label: 'Goal target',
    unit: 'USD',
    min: 100,
    max: 1_000_000_000,
    step: 100,
    default: 100000,
    help: 'Account balance the compound plan works toward.',
  },
  {
    key: 'compoundPercent',
    group: 'goal',
    label: 'Gain per milestone',
    unit: '%',
    min: 0.1,
    max: 50,
    step: 0.1,
    default: 2,
    help: 'Target gain per trade; drives the milestone ladder and daily target.',
  },
  {
    key: 'defaultLeverage',
    group: 'orders',
    label: 'Default leverage',
    unit: 'x',
    min: 1,
    max: 125,
    step: 1,
    default: 15,
    help: 'Leverage pre-filled on the order ticket.',
  },
  {
    key: 'riskPerTradePercent',
    group: 'orders',
    label: 'Risk per trade',
    unit: '% of wallet',
    min: 0.1,
    max: 100,
    step: 0.1,
    default: 2,
    help: 'Reference loss budget for a single stop-loss.',
  },
  {
    key: 'maxLeverageWarn',
    group: 'orders',
    label: 'High-leverage flag',
    unit: 'x',
    min: 1,
    max: 125,
    step: 1,
    default: 20,
    help: 'Positions at or above this leverage are flagged red.',
  },
  {
    key: 'maxOpenPositions',
    group: 'limits',
    label: 'Max open positions',
    unit: 'positions',
    min: 1,
    max: 100,
    step: 1,
    default: 3,
    help: 'Exceeding this raises a warning on the dashboard.',
  },
  {
    key: 'alarmLossPercent',
    group: 'limits',
    label: 'Daily loss alarm',
    unit: '% of balance',
    min: 0.5,
    max: 100,
    step: 0.5,
    default: 8,
    help: 'Audible early warning. Keep it below the circuit breaker.',
  },
  {
    key: 'dailyLossLimitPercent',
    group: 'limits',
    label: 'Daily loss circuit breaker',
    unit: '% of balance',
    min: 0.5,
    max: 100,
    step: 0.5,
    default: 10,
    help: "New entries under 20x are rejected once today's realized loss reaches this.",
  },
  {
    key: 'autoCloseOnBreaker',
    group: 'limits',
    type: 'boolean',
    label: 'Auto-close when the breaker trips',
    default: 0,
    help: 'Close every position below 20x leverage as soon as the daily limit is hit.',
  },
  {
    key: 'allowOrdersAfterBreach',
    group: 'limits',
    type: 'boolean',
    label: 'Allow entries after the breaker trips',
    default: 0,
    help: 'Overrides the circuit breaker. Leave off unless you have a reason.',
  },
  {
    key: 'inrRate',
    group: 'display',
    label: 'USD to INR rate',
    unit: '₹ per $',
    min: 1,
    max: 1000,
    step: 0.5,
    default: 100,
    help: 'Used to show PnL in rupees.',
  },
];

export const SETTINGS_GROUPS = [
  { id: 'goal', label: 'Goal' },
  { id: 'orders', label: 'Order defaults' },
  { id: 'limits', label: 'Loss limits' },
  { id: 'display', label: 'Display' },
];

export const DEFAULT_SETTINGS = Object.fromEntries(SETTINGS_FIELDS.map((f) => [f.key, f.default]));

/**
 * Validate a partial settings payload. Returns { values, errors } where values
 * only contains keys that passed validation.
 */
export function validateSettings(input = {}) {
  const values = {};
  const errors = {};
  for (const field of SETTINGS_FIELDS) {
    const raw = input[field.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (field.type === 'boolean') {
      values[field.key] = raw === true || Number(raw) === 1 ? 1 : 0;
      continue;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      errors[field.key] = 'Must be a number';
    } else if (num < field.min || num > field.max) {
      errors[field.key] = `Must be between ${field.min} and ${field.max}`;
    } else {
      values[field.key] = num;
    }
  }
  const alarm = values.alarmLossPercent ?? input.alarmLossPercent;
  const limit = values.dailyLossLimitPercent ?? input.dailyLossLimitPercent;
  if (Number.isFinite(Number(alarm)) && Number.isFinite(Number(limit)) && Number(alarm) > Number(limit)) {
    errors.alarmLossPercent = 'The alarm should fire before the circuit breaker';
  }
  return { values, errors };
}

export function withSettingsDefaults(stored) {
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}
