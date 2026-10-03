//! US employer hiring into Europe counts as America and as Stockholm-workable.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AmericaEuClass {
    pub america_quota: bool,
    pub stockholm_workable: bool,
}

const EU_NAMES: &[&str] = &[
    "europe",
    "eu",
    "emea",
    "nordics",
    "nordic",
    "stockholm",
    "sweden",
    "sverige",
    "london",
    "dublin",
    "berlin",
    "amsterdam",
    "paris",
    "helsinki",
    "poland",
    "ireland",
    "france",
    "germany",
    "italy",
    "spain",
    "switzerland",
    "netherlands",
    "gothenburg",
    "goteborg",
    "malmo",
    "copenhagen",
    "oslo",
    "munich",
    "barcelona",
    "madrid",
    "zurich",
    "lisbon",
    "warsaw",
    "tallinn",
    "estonia",
    "denmark",
    "norway",
    "finland",
    "austria",
    "prague",
];

const EU_CODES: &[&str] = &[
    "fr", "de", "it", "es", "ch", "uk", "se", "ie", "pl", "nl", "pt", "ee", "dk", "no", "fi", "at",
    "cz", "be", "lu", "is", "li",
];

const ADMIN_CODES: &[&str] = &[
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks",
    "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny",
    "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
    "wi", "wy", "dc", "ab", "bc", "mb", "nb", "nl", "ns", "nt", "nu", "on", "pe", "qc", "sk", "yt",
];

pub fn classify(us_employer: bool, location: &str) -> AmericaEuClass {
    let stockholm_workable = stockholm_workable(location);
    AmericaEuClass {
        america_quota: us_employer && stockholm_workable,
        stockholm_workable,
    }
}

fn stockholm_workable(location: &str) -> bool {
    split_segments(location)
        .iter()
        .any(|segment| segment_workable(segment))
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

fn segment_workable(segment: &str) -> bool {
    let tokens = segment_tokens(segment);
    if tokens.is_empty() {
        return false;
    }
    if iso_only(&tokens) {
        return true;
    }
    if ends_with_admin_code(&tokens) || mentions_us_without_eu_name(&tokens) {
        return false;
    }
    has_eu_name(&tokens) || global_remote(&tokens)
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

fn ends_with_admin_code(tokens: &[String]) -> bool {
    tokens
        .last()
        .is_some_and(|token| ADMIN_CODES.contains(&token.as_str()))
}

fn mentions_us_without_eu_name(tokens: &[String]) -> bool {
    if has_eu_name(tokens) {
        return false;
    }
    tokens.iter().any(|token| token == "us" || token == "usa")
        || tokens
            .windows(2)
            .any(|pair| pair[0] == "united" && pair[1] == "states")
}

fn has_eu_name(tokens: &[String]) -> bool {
    tokens
        .iter()
        .any(|token| EU_NAMES.contains(&token.as_str()))
}

fn global_remote(tokens: &[String]) -> bool {
    let remote = tokens.iter().any(|token| token == "remote");
    let broad = tokens
        .iter()
        .any(|token| token == "global" || token == "worldwide");
    remote && broad
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_a_location_strings() {
        let cases = [
            ("Europe", true, true, true),
            ("Remote UK/Poland", true, true, true),
            ("Stockholm", true, true, true),
            ("London", true, true, true),
            ("Global remote", true, true, true),
            ("FR/DE/IT/ES/CH/UK remote", true, true, true),
            ("SF-only", true, false, false),
            ("US-remote-only", true, false, false),
            ("San Francisco, CA", true, false, false),
            ("Washington, DC", true, false, false),
            ("Remote, United States", true, false, false),
            ("Palo Alto, CA", true, false, false),
            ("Stockholm", false, false, true),
            ("London", false, false, true),
            ("Europe", false, false, true),
            ("SF-only", false, false, false),
            ("Remote", true, false, false),
            ("Global", true, false, false),
            ("Dublin; London", true, true, true),
            ("Remote – Europe", true, true, true),
            ("Helsinki", true, true, true),
            ("Remote – Ireland", true, true, true),
            ("", true, false, false),
            ("Paris, TX", true, false, false),
            ("Wilmington, DE", true, false, false),
            ("Dublin, CA", true, false, false),
            ("Dublin, OH", true, false, false),
            ("Berlin, NH", true, false, false),
            ("Amsterdam, NY", true, false, false),
            ("London, ON", true, false, false),
            ("Remote - US (IT, Security)", true, false, false),
            ("Remote, United States (SE region)", true, false, false),
            ("Remote, EU", true, true, true),
            ("Remote EMEA", true, true, true),
            ("Lisbon", true, true, true),
            ("Warsaw", true, true, true),
            ("Tallinn/Estonia", true, true, true),
            ("Nordics", true, true, true),
            ("Denmark", true, true, true),
            ("Norway", true, true, true),
            ("Finland", true, true, true),
            ("Austria", true, true, true),
            ("Prague", true, true, true),
            ("Worldwide remote", true, true, true),
            ("DE", true, true, true),
            ("Portland, OR", true, false, false),
            ("Remote, EU; Paris, TX", true, true, true),
            ("Lisbon | Paris, TX", true, true, true),
            ("Paris, TX / Remote - US", true, false, false),
            ("London, ON or Remote, United States", true, false, false),
        ];
        for (location, us_employer, america_quota, stockholm_workable) in cases {
            let class = classify(us_employer, location);
            assert_eq!(
                class,
                AmericaEuClass {
                    america_quota,
                    stockholm_workable,
                },
                "{location} us={us_employer}"
            );
        }
    }
}
