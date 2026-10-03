//! US employer hiring into Europe counts as America and as Stockholm-workable.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AmericaEuClass {
    pub america_quota: bool,
    pub stockholm_workable: bool,
}

const EU_TOKENS: &[&str] = &[
    "europe",
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
    "fr",
    "de",
    "it",
    "es",
    "ch",
    "uk",
    "se",
    "ie",
    "pl",
    "nl",
];

pub fn classify(us_employer: bool, location: &str) -> AmericaEuClass {
    let stockholm_workable = stockholm_workable(location);
    AmericaEuClass {
        america_quota: us_employer && stockholm_workable,
        stockholm_workable,
    }
}

fn stockholm_workable(location: &str) -> bool {
    let hay = pad(location);
    if hay == " " {
        return false;
    }
    let global_remote = token(&hay, "global") && token(&hay, "remote");
    let eu = EU_TOKENS.iter().any(|label| token(&hay, label));
    global_remote || eu
}

fn pad(location: &str) -> String {
    let mut out = String::from(" ");
    for ch in location.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else {
            out.push(' ');
        }
    }
    out.push(' ');
    while out.contains("  ") {
        out = out.replace("  ", " ");
    }
    out
}

fn token(hay: &str, label: &str) -> bool {
    hay.contains(&format!(" {label} "))
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
