BEGIN;
CREATE TABLE labor_releases (
 id UUID PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('onet','bls')),version TEXT NOT NULL,
 checksum TEXT NOT NULL CHECK(length(checksum)=64),imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),sources JSONB NOT NULL,
 UNIQUE(kind,checksum),UNIQUE(id,kind)
);
CREATE TABLE labor_active (
 kind TEXT PRIMARY KEY CHECK(kind IN ('onet','bls')),release_id UUID NOT NULL,
 FOREIGN KEY(release_id,kind) REFERENCES labor_releases(id,kind)
);
CREATE TABLE labor_skills (
 release_id UUID NOT NULL REFERENCES labor_releases(id),id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('essential','transferable','software')),url TEXT NOT NULL,
 PRIMARY KEY(release_id,id)
);
CREATE TABLE labor_occupations (
 release_id UUID NOT NULL REFERENCES labor_releases(id),code TEXT NOT NULL,soc_code TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,
 PRIMARY KEY(release_id,code)
);
CREATE TABLE labor_skill_occupations (
 release_id UUID NOT NULL,skill_id TEXT NOT NULL,occupation_code TEXT NOT NULL,importance NUMERIC,data_date TEXT,basis TEXT NOT NULL,
 PRIMARY KEY(release_id,skill_id,occupation_code),
 FOREIGN KEY(release_id,skill_id) REFERENCES labor_skills(release_id,id),
 FOREIGN KEY(release_id,occupation_code) REFERENCES labor_occupations(release_id,code),
 CHECK(importance IS NULL OR importance BETWEEN 0 AND 5)
);
CREATE INDEX labor_skill_name ON labor_skills(release_id,lower(name));
CREATE TABLE labor_wages (
 release_id UUID NOT NULL REFERENCES labor_releases(id),soc_code TEXT NOT NULL,region TEXT NOT NULL,region_name TEXT NOT NULL,year INTEGER NOT NULL,
 median_annual NUMERIC,median_hourly NUMERIC,annual_marker TEXT,hourly_marker TEXT,
 PRIMARY KEY(release_id,soc_code,region),
 CHECK(median_annual IS NULL OR median_annual>=0),CHECK(median_hourly IS NULL OR median_hourly>=0)
);
CREATE TABLE labor_projections (
 release_id UUID NOT NULL REFERENCES labor_releases(id),soc_code TEXT NOT NULL,title TEXT NOT NULL,base_year INTEGER NOT NULL,end_year INTEGER NOT NULL,
 percent_change NUMERIC,annual_openings NUMERIC,
 PRIMARY KEY(release_id,soc_code),CHECK(end_year>base_year),CHECK(annual_openings IS NULL OR annual_openings>=0)
);
CREATE FUNCTION labor_reference_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Labor-market reference releases are immutable; import a new release'; END; $$;
CREATE TRIGGER labor_release_snapshot BEFORE UPDATE OR DELETE ON labor_releases FOR EACH ROW EXECUTE FUNCTION labor_reference_immutable();
CREATE TRIGGER labor_skill_snapshot BEFORE UPDATE OR DELETE ON labor_skills FOR EACH ROW EXECUTE FUNCTION labor_reference_immutable();
CREATE TRIGGER labor_occupation_snapshot BEFORE UPDATE OR DELETE ON labor_occupations FOR EACH ROW EXECUTE FUNCTION labor_reference_immutable();
CREATE TRIGGER labor_link_snapshot BEFORE UPDATE OR DELETE ON labor_skill_occupations FOR EACH ROW EXECUTE FUNCTION labor_reference_immutable();
CREATE TRIGGER labor_wage_snapshot BEFORE UPDATE OR DELETE ON labor_wages FOR EACH ROW EXECUTE FUNCTION labor_reference_immutable();
CREATE TRIGGER labor_projection_snapshot BEFORE UPDATE OR DELETE ON labor_projections FOR EACH ROW EXECUTE FUNCTION labor_reference_immutable();
COMMIT;
