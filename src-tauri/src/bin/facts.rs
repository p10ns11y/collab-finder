use std::env;
use std::path::Path;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let Some(cmd) = args.next() else {
        return usage();
    };
    if cmd != "firms" {
        return usage();
    }
    let mut universe = None;
    let mut out = None;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--universe" => universe = args.next(),
            "--out" => out = args.next(),
            _ => return usage(),
        }
    }
    let (Some(universe), Some(out)) = (universe, out) else {
        return usage();
    };
    if universe.is_empty() || out.is_empty() {
        return usage();
    }
    match collab_finder_lib::facts::write_firms(Path::new(&universe), Path::new(&out)) {
        Ok(summary) => {
            println!("{summary}");
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("{err}");
            ExitCode::from(1)
        }
    }
}

fn usage() -> ExitCode {
    eprintln!("usage: facts firms --universe PATH --out PATH");
    ExitCode::from(2)
}
