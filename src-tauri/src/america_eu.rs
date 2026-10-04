//! US employer hiring into Europe counts as America and as Stockholm-workable.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GeoPlace {
    Europe,
    KnownNonEu,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AmericaEuClass {
    pub america_quota: bool,
    pub stockholm_workable: bool,
    pub place: GeoPlace,
}

const EU_CITIES: &[&str] = &[
    "amsterdam",
    "barcelona",
    "berlin",
    "bratislava",
    "bremen",
    "brussels",
    "cologne",
    "copenhagen",
    "delft",
    "dortmund",
    "dresden",
    "dublin",
    "dusseldorf",
    "edinburgh",
    "eindhoven",
    "frankfurt",
    "gothenburg",
    "goteborg",
    "groningen",
    "haarlem",
    "hague",
    "hamburg",
    "hannover",
    "hanover",
    "helsinki",
    "leipzig",
    "lisbon",
    "london",
    "maastricht",
    "madrid",
    "malmo",
    "munich",
    "nantes",
    "nuremberg",
    "oslo",
    "paris",
    "prague",
    "rotterdam",
    "stockholm",
    "stuttgart",
    "tallinn",
    "utrecht",
    "valletta",
    "vienna",
    "warsaw",
    "wien",
    "zurich",
];

const EU_COUNTRIES: &[&str] = &[
    "austria",
    "belgium",
    "bulgaria",
    "croatia",
    "cyprus",
    "czech",
    "czechia",
    "denmark",
    "england",
    "estonia",
    "finland",
    "france",
    "germany",
    "greece",
    "hungary",
    "iceland",
    "ireland",
    "italy",
    "latvia",
    "liechtenstein",
    "lithuania",
    "luxembourg",
    "malta",
    "netherlands",
    "norway",
    "poland",
    "portugal",
    "romania",
    "scotland",
    "slovakia",
    "slovenia",
    "spain",
    "sverige",
    "sweden",
    "switzerland",
    "wales",
];

const EU_REGIONS: &[&str] = &["emea", "eu", "europe", "nordic", "nordics"];

const EU_PHRASES: &[&[&str]] = &[&["czech", "republic"], &["united", "kingdom"]];

const EU_CODES: &[&str] = &[
    "at", "be", "bg", "ch", "cy", "cz", "de", "dk", "ee", "es", "fi", "fr", "gb", "gr", "hr", "hu",
    "ie", "is", "it", "li", "lt", "lu", "lv", "mt", "nl", "no", "pl", "pt", "ro", "se", "si", "sk",
    "uk",
];

const ADMIN_CODES: &[&str] = &[
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks",
    "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny",
    "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
    "wi", "wy", "dc", "ab", "bc", "mb", "nb", "nl", "ns", "nt", "nu", "on", "pe", "qc", "sk", "yt",
];

const US_STATES: &[&str] = &[
    "alabama",
    "alaska",
    "arizona",
    "arkansas",
    "california",
    "colorado",
    "connecticut",
    "delaware",
    "florida",
    "georgia",
    "hawaii",
    "idaho",
    "illinois",
    "indiana",
    "iowa",
    "kansas",
    "kentucky",
    "louisiana",
    "maine",
    "maryland",
    "massachusetts",
    "michigan",
    "minnesota",
    "mississippi",
    "missouri",
    "montana",
    "nebraska",
    "nevada",
    "ohio",
    "oklahoma",
    "oregon",
    "pennsylvania",
    "tennessee",
    "texas",
    "utah",
    "vermont",
    "virginia",
    "washington",
    "wisconsin",
    "wyoming",
];

const US_STATE_PHRASES: &[&[&str]] = &[
    &["district", "of", "columbia"],
    &["new", "hampshire"],
    &["new", "jersey"],
    &["new", "mexico"],
    &["new", "york"],
    &["north", "carolina"],
    &["north", "dakota"],
    &["rhode", "island"],
    &["south", "carolina"],
    &["south", "dakota"],
    &["west", "virginia"],
];

const NON_EU_MARKERS: &[&str] = &["canada", "israel", "ontario", "us", "usa"];

const US_CITY_PHRASES: &[&[&str]] = &[&["palo", "alto"], &["san", "francisco"]];

const NORTH_AMERICA_CITIES: &[&str] = &[
    "billings",
    "bozeman",
    "dover",
    "helena",
    "missoula",
    "regina",
    "saskatoon",
    "wilmington",
];

pub fn classify(us_employer: bool, location: &str) -> AmericaEuClass {
    let place = place_of(location);
    let stockholm_workable = place == GeoPlace::Europe;
    AmericaEuClass {
        america_quota: us_employer && stockholm_workable,
        stockholm_workable,
        place,
    }
}

fn place_of(location: &str) -> GeoPlace {
    let segments = split_segments(location);
    if segments.is_empty() {
        return GeoPlace::Unknown;
    }
    let mut saw_non_eu = false;
    for segment in &segments {
        match segment_place(segment) {
            GeoPlace::Europe => return GeoPlace::Europe,
            GeoPlace::KnownNonEu => saw_non_eu = true,
            GeoPlace::Unknown => {}
        }
    }
    if saw_non_eu {
        GeoPlace::KnownNonEu
    } else {
        GeoPlace::Unknown
    }
}

fn split_segments(location: &str) -> Vec<String> {
    let mut parts = vec![location.to_ascii_lowercase()];
    for sep in [';', '/', '|'] {
        parts = parts
            .into_iter()
            .flat_map(|part| part.split(sep).map(str::to_string).collect::<Vec<_>>())
            .collect();
    }
    parts
        .into_iter()
        .flat_map(|part| part.split(" or ").map(str::to_string).collect::<Vec<_>>())
        .map(|part| part.trim().to_string())
        .filter(|part| !part.is_empty())
        .collect()
}

fn segment_place(segment: &str) -> GeoPlace {
    let tokens = segment_tokens(segment);
    if tokens.is_empty() {
        return GeoPlace::Unknown;
    }
    if iso_only(&tokens) {
        return GeoPlace::Europe;
    }
    if us_state_name(&tokens) {
        return GeoPlace::KnownNonEu;
    }
    if non_eu_marker(&tokens) && !eu_country_or_region(&tokens) {
        return GeoPlace::KnownNonEu;
    }
    if let Some(place) = admin_code_place(&tokens) {
        if place != GeoPlace::Unknown || !us_city(&tokens) {
            return place;
        }
    }
    if eu_place(&tokens) || global_remote(&tokens) {
        return GeoPlace::Europe;
    }
    if us_city(&tokens) {
        return GeoPlace::KnownNonEu;
    }
    GeoPlace::Unknown
}

fn segment_tokens(segment: &str) -> Vec<String> {
    segment
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|token| !token.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

fn iso_only(tokens: &[String]) -> bool {
    tokens
        .iter()
        .any(|token| EU_CODES.contains(&token.as_str()))
        && tokens
            .iter()
            .all(|token| token == "remote" || EU_CODES.contains(&token.as_str()))
}

fn us_state_name(tokens: &[String]) -> bool {
    tokens
        .iter()
        .any(|token| US_STATES.contains(&token.as_str()))
        || has_phrase(tokens, US_STATE_PHRASES)
}

fn non_eu_marker(tokens: &[String]) -> bool {
    tokens
        .iter()
        .any(|token| NON_EU_MARKERS.contains(&token.as_str()))
        || has_phrase(tokens, &[&["united", "states"]])
}

fn eu_country_or_region(tokens: &[String]) -> bool {
    tokens
        .iter()
        .any(|token| EU_COUNTRIES.contains(&token.as_str()) || EU_REGIONS.contains(&token.as_str()))
        || has_phrase(tokens, EU_PHRASES)
}

fn eu_city(tokens: &[String]) -> bool {
    tokens
        .iter()
        .any(|token| EU_CITIES.contains(&token.as_str()))
}

fn eu_place(tokens: &[String]) -> bool {
    eu_country_or_region(tokens) || eu_city(tokens)
}

fn admin_code_place(tokens: &[String]) -> Option<GeoPlace> {
    let code = tokens.last()?;
    if !ADMIN_CODES.contains(&code.as_str()) {
        return None;
    }
    let colliding = EU_CODES.contains(&code.as_str());
    if colliding && eu_place(tokens) {
        return Some(GeoPlace::Europe);
    }
    if colliding && !north_america_city(tokens) {
        return Some(GeoPlace::Unknown);
    }
    Some(GeoPlace::KnownNonEu)
}

fn north_america_city(tokens: &[String]) -> bool {
    tokens
        .iter()
        .any(|token| NORTH_AMERICA_CITIES.contains(&token.as_str()))
}

fn global_remote(tokens: &[String]) -> bool {
    let remote = tokens.iter().any(|token| token == "remote");
    let broad = tokens
        .iter()
        .any(|token| token == "global" || token == "worldwide");
    remote && broad
}

fn us_city(tokens: &[String]) -> bool {
    tokens.iter().any(|token| token == "sf") || has_phrase(tokens, US_CITY_PHRASES)
}

fn has_phrase(tokens: &[String], phrases: &[&[&str]]) -> bool {
    phrases.iter().any(|phrase| {
        tokens.windows(phrase.len()).any(|window| {
            window
                .iter()
                .zip(phrase.iter())
                .all(|(token, word)| token == word)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_a_location_strings() {
        let europe = GeoPlace::Europe;
        let non_eu = GeoPlace::KnownNonEu;
        let unknown = GeoPlace::Unknown;
        let cases = [
            ("Europe", true, europe),
            ("Remote UK/Poland", true, europe),
            ("Stockholm", true, europe),
            ("London", true, europe),
            ("Global remote", true, europe),
            ("FR/DE/IT/ES/CH/UK remote", true, europe),
            ("SF-only", true, non_eu),
            ("US-remote-only", true, non_eu),
            ("San Francisco, CA", true, non_eu),
            ("Washington, DC", true, non_eu),
            ("Remote, United States", true, non_eu),
            ("Palo Alto, CA", true, non_eu),
            ("Stockholm", false, europe),
            ("London", false, europe),
            ("Europe", false, europe),
            ("SF-only", false, non_eu),
            ("Remote", true, unknown),
            ("Global", true, unknown),
            ("Dublin; London", true, europe),
            ("Remote – Europe", true, europe),
            ("Helsinki", true, europe),
            ("Remote – Ireland", true, europe),
            ("", true, unknown),
            ("Paris, TX", true, non_eu),
            ("Wilmington, DE", true, non_eu),
            ("Dublin, CA", true, non_eu),
            ("Dublin, OH", true, non_eu),
            ("Berlin, NH", true, non_eu),
            ("Amsterdam, NY", true, non_eu),
            ("London, ON", true, non_eu),
            ("Remote - US (IT, Security)", true, non_eu),
            ("Remote, United States (SE region)", true, non_eu),
            ("Remote, EU", true, europe),
            ("Remote EMEA", true, europe),
            ("Lisbon", true, europe),
            ("Warsaw", true, europe),
            ("Tallinn/Estonia", true, europe),
            ("Nordics", true, europe),
            ("Denmark", true, europe),
            ("Norway", true, europe),
            ("Finland", true, europe),
            ("Austria", true, europe),
            ("Prague", true, europe),
            ("Worldwide remote", true, europe),
            ("DE", true, europe),
            ("Portland, OR", true, non_eu),
            ("Remote, EU; Paris, TX", true, europe),
            ("Lisbon | Paris, TX", true, europe),
            ("Paris, TX / Remote - US", true, non_eu),
            ("London, ON or Remote, United States", true, non_eu),
            ("United Kingdom", true, europe),
            ("Remote, United Kingdom", true, europe),
            ("UK", true, europe),
            ("Nantes", true, europe),
            ("Berlin, DE", true, europe),
            ("Munich, DE", true, europe),
            ("Amsterdam, NL", true, europe),
            ("Paris, Texas", true, non_eu),
            ("London, Kentucky", true, non_eu),
            ("Dublin, OH, USA", true, non_eu),
            ("Dublin, Ohio, United States", true, non_eu),
            ("England", true, europe),
            ("Scotland", true, europe),
            ("Wales", true, europe),
            ("Portugal", true, europe),
            ("Belgium", true, europe),
            ("Brussels", true, europe),
            ("Edinburgh", true, europe),
            ("Bulgaria", true, europe),
            ("Croatia", true, europe),
            ("Cyprus", true, europe),
            ("Czechia", true, europe),
            ("Czech Republic", true, europe),
            ("Greece", true, europe),
            ("Hungary", true, europe),
            ("Latvia", true, europe),
            ("Lithuania", true, europe),
            ("Luxembourg", true, europe),
            ("Malta", true, europe),
            ("Romania", true, europe),
            ("Slovakia", true, europe),
            ("Slovenia", true, europe),
            ("Iceland", true, europe),
            ("Liechtenstein", true, europe),
            ("BG", true, europe),
            ("HR", true, europe),
            ("CY", true, europe),
            ("GR", true, europe),
            ("HU", true, europe),
            ("LV", true, europe),
            ("LT", true, europe),
            ("RO", true, europe),
            ("SI", true, europe),
            ("GB", true, europe),
            (
                "Remote, United Kingdom, Canada, United States, Israel",
                true,
                europe,
            ),
            ("Remote, United Kingdom; Canada", true, europe),
            ("Dublin, Ohio", true, non_eu),
            ("Amsterdam, New York", true, non_eu),
            ("Eindhoven, NL", true, europe),
            ("Rotterdam, NL", true, europe),
            ("Utrecht, NL", true, europe),
            ("The Hague, NL", true, europe),
            ("Hamburg, DE", true, europe),
            ("Frankfurt, DE", true, europe),
            ("Cologne, DE", true, europe),
            ("Stuttgart, DE", true, europe),
            ("Vienna", true, europe),
            ("Bratislava, SK", true, europe),
            ("Valletta, MT", true, europe),
            ("SK", true, europe),
            ("MT", true, europe),
            ("Kiel, DE", true, unknown),
            ("Dover, DE", true, non_eu),
            ("Helena, MT", true, non_eu),
            ("Regina, SK", true, non_eu),
            ("San Francisco, DE", true, non_eu),
        ];
        for (location, us_employer, place) in cases {
            let stockholm_workable = place == GeoPlace::Europe;
            assert_eq!(
                classify(us_employer, location),
                AmericaEuClass {
                    america_quota: us_employer && stockholm_workable,
                    stockholm_workable,
                    place,
                },
                "{location} us={us_employer}"
            );
        }
    }
}
