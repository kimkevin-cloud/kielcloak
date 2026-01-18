// Mocks zum Testen
export const mockUserForms = {
  forms: [
    {
      antrag_type: "Begrüssungsgeld",
      timestamp: "2026-01-10T12:00:00Z",
    },
    {
      antrag_type: "Ummeldung",
      timestamp: "2026-01-11T09:30:00Z",
    },
    {
      antrag_type: "Ummeldung2",
      timestamp: "2026-09-22T06:48:10Z",
    },
    {
      antrag_type: "Ummeldung",
      timestamp: "2026-03-07T14:12:45Z",
    },
  ],
};

export const mockEncodedWebID =
  "aHR0cDovL2xvY2FsaG9zdDozMDAwL3N0dWQvcHJvZmlsZS9jYXJkI21l";

export const mockFormURLs = {
  URLS: [
    "https://solid.valetudo.casa/kielcloak/antraege/antrag_begruessungsgeld_aHR0cDovL2xvY2FsaG9zdDozMDAwL3N0dWQvcHJvZmlsZS9jYXJkI21l_1768012811111.ttl",
    "https://solid.valetudo.casa/kielcloak/antraege/antrag_ummeldung3_aHR0cDovL2xvY2FsaG9zdDozMDAwL3N0dWQvcHJvZmlsZS9jYXJkI21l_1768012855555.ttl",
    "https://solid.valetudo.casa/kielcloak/antraege/antrag_ummeldung4_aHR0cDovL2xvY2FsaG9zdDozMDAwL3N0dWQvcHJvZmlsZS9jYXJkI21l_1768012899999.ttl",
  ],
};
