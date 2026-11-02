fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut zones: Vec<_> = chrono_tz::TZ_VARIANTS
        .iter()
        .map(|zone| zone.name())
        .collect();
    zones.sort_unstable();
    let path = std::env::args()
        .nth(1)
        .expect("provide the output JSON path");
    std::fs::write(path, serde_json::to_string_pretty(&zones)? + "\n")?;
    println!("Exported {} timezone identifiers", zones.len());
    Ok(())
}
