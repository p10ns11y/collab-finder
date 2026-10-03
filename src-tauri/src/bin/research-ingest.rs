use std::env;
use std::path::Path;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let mut db = None;
    let mut input = None;
    let mut exclude = None;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--db" => db = args.next(),
            "--input" => input = args.next(),
            "--exclude" => exclude = args.next(),
            _ => return usage(),
        }
    }
    let (Some(db), Some(input)) = (db, input) else {
        return usage();
    };
    match collab_finder_lib::research_ingest::ingest_files(
        Path::new(&db),
        Path::new(&input),
        exclude.as_deref().map(Path::new),
    ) {
        Ok(report) => {
            println!("{}", serde_json::to_string(&report).unwrap_or_default());
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("{err}");
            ExitCode::from(1)
        }
    }
}

fn usage() -> ExitCode {
    eprintln!("usage: research-ingest --db PATH --input PATH [--exclude PATH]");
    ExitCode::from(1)
}
