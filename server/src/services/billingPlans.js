const BILLING_PLANS = {
  starter: {
    code: 'starter',
    name: 'Starter',
    amount: 299000,
    validity_label: 'aktif 6 bulan',
    features: ['1 acara', 'RSVP sampai 100 tamu', 'Galeri 10 foto'],
  },
  standard: {
    code: 'standard',
    name: 'Standard',
    amount: 499000,
    validity_label: 'aktif 12 bulan',
    features: ['Semua fitur Starter', 'RSVP sampai 300 tamu', 'WA blast + subdomain'],
  },
  premium: {
    code: 'premium',
    name: 'Premium',
    amount: 799000,
    validity_label: 'aktif selamanya',
    features: ['Semua fitur Standard', 'RSVP & galeri unlimited', 'Custom domain + prioritas support'],
  },
};

function getPlan(code) {
  return BILLING_PLANS[code] || null;
}

function listPlans() {
  return Object.values(BILLING_PLANS);
}

module.exports = {
  BILLING_PLANS,
  getPlan,
  listPlans,
};
