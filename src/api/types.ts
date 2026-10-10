export type EloRestricties = {
  leerlingId?: number;
  huiswerkBekijkenAan?: boolean;
  roosterBekijkenAan?: boolean;
  cijfersBekijkenAan?: boolean;
};

export type AccountMe = {
  additionalObjects?: {
    restricties?: {
      items?: EloRestricties[];
    };
  };
};

export type AfspraakItem = {
  beginDatumTijd?: string;
  eindDatumTijd?: string;
  beginLesuur?: number;
  eindLesuur?: number;
  locatie?: string;
  titel?: string;
  vak?: { naam?: string; afkorting?: string };
  docentNamen?: string[];
};

export type HolidayItem = {
  naam?: string;
  beginDatum?: string;
  eindDatum?: string;
  startDatum?: string;
  totDatum?: string;
  vanafDatum?: string;
};

export type StudiewijzerItem = {
  onderwerp?: string;
  huiswerkType?: string;
  omschrijving?: string;
  bijlagen?: Array<{ bestand?: { bestandsnaam?: string } }>;
  inlevermomenten?: Array<{
    startGeldigheid?: string;
    eindGeldigheid?: string;
    inleveringenAantal?: number;
    inleveringenVerwacht?: number;
  }>;
};

export type HomeworkItem = {
  datumTijd?: string;
  weeknummerVanaf?: number;
  weeknummerTm?: number;
  studiewijzerItem?: StudiewijzerItem;
  lesgroep?: { naam?: string; vak?: { naam?: string } };
  additionalObjects?: { lesgroep?: { naam?: string; vak?: { naam?: string } } };
};

export type GeldendResultaat = {
  cijfer?: number;
  formattedResultaat?: string;
  weging?: number;
  toetssoort?: string;
  toetscode?: string;
  datumInvoerEerstePoging?: string;
  herkansing?: string;
  type?: string;
  additionalObjects?: { vaknaam?: string };
};

export type Plaatsing = {
  UUID?: string;
  huidig?: boolean;
};

export type Vakgemiddelde = {
  vakkeuze?: { vak?: { afkorting?: string; naam?: string } };
  voortgangsdossierResultaat?: { formattedResultaat?: string };
};

export type ItemList<T> = { items?: T[] };
