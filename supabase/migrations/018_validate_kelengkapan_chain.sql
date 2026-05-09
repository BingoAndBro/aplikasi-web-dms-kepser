-- Remove invalid kelengkapan chains and prevent future parent/child mismatches.
--
-- Invalid examples:
-- - kategori_permintaan_id is filled but jenis_permintaan_id is empty.
-- - kategori_permintaan_id does not belong to jenis_permintaan_id.
-- - detail_permintaan_id is filled but kategori_permintaan_id is empty.
-- - detail_permintaan_id does not belong to kategori_permintaan_id.

delete from master_kelengkapan_dokumen mkd
where (
    mkd.kategori_permintaan_id is not null
    and (
      mkd.jenis_permintaan_id is null
      or not exists (
        select 1
        from master_kategori_permintaan mkp
        where mkp.id = mkd.kategori_permintaan_id
          and mkp.jenis_permintaan_id = mkd.jenis_permintaan_id
      )
    )
  )
  or (
    mkd.detail_permintaan_id is not null
    and (
      mkd.kategori_permintaan_id is null
      or not exists (
        select 1
        from master_detail_permintaan mdp
        where mdp.id = mkd.detail_permintaan_id
          and mdp.kategori_permintaan_id = mkd.kategori_permintaan_id
      )
    )
  );

create or replace function validate_master_kelengkapan_chain()
returns trigger
language plpgsql
as $$
declare
  parent_jenis_id uuid;
  parent_kategori_id uuid;
begin
  if new.detail_permintaan_id is not null and new.kategori_permintaan_id is null then
    raise exception 'detail_permintaan_id requires kategori_permintaan_id';
  end if;

  if new.kategori_permintaan_id is not null and new.jenis_permintaan_id is null then
    raise exception 'kategori_permintaan_id requires jenis_permintaan_id';
  end if;

  if new.kategori_permintaan_id is not null then
    select jenis_permintaan_id
      into parent_jenis_id
      from master_kategori_permintaan
      where id = new.kategori_permintaan_id;

    if parent_jenis_id is null then
      raise exception 'kategori_permintaan_id not found';
    end if;

    if parent_jenis_id <> new.jenis_permintaan_id then
      raise exception 'kategori_permintaan_id does not belong to jenis_permintaan_id';
    end if;
  end if;

  if new.detail_permintaan_id is not null then
    select kategori_permintaan_id
      into parent_kategori_id
      from master_detail_permintaan
      where id = new.detail_permintaan_id;

    if parent_kategori_id is null then
      raise exception 'detail_permintaan_id not found';
    end if;

    if parent_kategori_id <> new.kategori_permintaan_id then
      raise exception 'detail_permintaan_id does not belong to kategori_permintaan_id';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_master_kelengkapan_chain on master_kelengkapan_dokumen;

create trigger trg_validate_master_kelengkapan_chain
before insert or update of jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id
on master_kelengkapan_dokumen
for each row
execute function validate_master_kelengkapan_chain();
