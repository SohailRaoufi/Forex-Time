use std::{fs, path::PathBuf, sync::RwLock};

use chrono_tz::{Asia::Kabul, Tz};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
struct SavedTimezone {
    home_timezone: String,
}

pub struct TimezonePreference {
    zone: RwLock<Tz>,
    path: PathBuf,
}

impl TimezonePreference {
    pub fn load(path: PathBuf) -> Self {
        let zone = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<SavedTimezone>(&bytes).ok())
            .and_then(|saved| saved.home_timezone.parse().ok())
            .unwrap_or(Kabul);
        Self {
            zone: RwLock::new(zone),
            path,
        }
    }

    pub fn get(&self) -> Tz {
        *self
            .zone
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn set(&self, id: &str) -> Result<Tz, String> {
        let zone: Tz = id
            .parse()
            .map_err(|_| "Choose a valid IANA timezone.".to_string())?;
        let mut current = self
            .zone
            .write()
            .map_err(|_| "Timezone preferences are unavailable.".to_string())?;
        let save = || -> Result<(), Box<dyn std::error::Error>> {
            if let Some(parent) = self.path.parent() {
                fs::create_dir_all(parent)?;
            }
            let temporary = self.path.with_extension("tmp");
            fs::write(
                &temporary,
                serde_json::to_vec(&SavedTimezone {
                    home_timezone: id.to_owned(),
                })?,
            )?;
            fs::rename(temporary, &self.path)?;
            Ok(())
        };
        save().map_err(|error| format!("Could not save your timezone: {error}"))?;
        *current = zone;
        Ok(zone)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timezone_is_validated_persisted_and_restored() {
        let path =
            std::env::temp_dir().join(format!("forex-time-zone-test-{}.json", std::process::id()));
        let preference = TimezonePreference::load(path.clone());
        preference.set("Asia/Kathmandu").unwrap();
        assert_eq!(
            TimezonePreference::load(path.clone()).get().name(),
            "Asia/Kathmandu"
        );
        assert!(preference.set("invalid/region").is_err());
        assert_eq!(preference.get().name(), "Asia/Kathmandu");
        // Replacing an existing preference must work on Windows too.
        preference.set("America/New_York").unwrap();
        assert_eq!(
            TimezonePreference::load(path.clone()).get().name(),
            "America/New_York"
        );
        fs::write(&path, "broken settings").unwrap();
        assert_eq!(TimezonePreference::load(path.clone()).get(), Kabul);
        fs::remove_file(path).unwrap();
    }
}
