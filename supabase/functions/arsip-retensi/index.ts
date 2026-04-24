// supabase/functions/arsip-retensi/index.ts
// Supabase Edge Function — Auto-transition arsip berdasarkan masa retensi
// Dijalankan via pg_cron setiap hari jam 02:00

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TransitionResult {
  processed: number
  errors: string[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const errors: string[] = []

    // ── Phase 1: Verifikasi Penyusutan ──────────────────────────────
    // Arsip AKTIF dengan masa_aktif_berakhir <= today → VERIFIKASI_PENYUSUTAN
    const today = new Date().toISOString().split('T')[0]

    const { data: aktifExpired, error: aktifError } = await supabase
      .from('arsip')
      .select('id, dokumen_id')
      .eq('status_arsip', 'AKTIF')
      .eq('is_ditolak', false)
      .lte('masa_aktif_berakhir', today)

    if (aktifError) {
      errors.push(`[Phase1] Query error: ${aktifError.message}`)
    }

    let verifikasiProcessed = 0
    if (aktifExpired && aktifExpired.length > 0) {
      for (const arsip of aktifExpired) {
        // Cek belum ada verifikasi aktif
        const { data: existing } = await supabase
          .from('arsip_verifikasi_penyusutan')
          .select('id')
          .eq('arsip_id', arsip.id)
          .single()

        if (existing) continue // skip if already in verification

        // Insert verifikasi record
        const { error: insertError } = await supabase
          .from('arsip_verifikasi_penyusutan')
          .insert({
            arsip_id: arsip.id,
            status: 'MENUNGGU',
            catatan: 'Auto-transition via cron',
            dipindahkan_oleh: null,
          })

        if (insertError) {
          if (insertError.code === '23505') {
            // UNIQUE constraint violation — already processed, skip
            continue
          }
          errors.push(`[Phase1] Insert error for arsip ${arsip.id}: ${insertError.message}`)
          continue
        }

        // Update status
        const { error: updateError } = await supabase
          .from('arsip')
          .update({ status_arsip: 'VERIFIKASI_PENYUSUTAN' })
          .eq('id', arsip.id)

        if (updateError) {
          errors.push(`[Phase1] Update error for arsip ${arsip.id}: ${updateError.message}`)
          continue
        }

        // Insert log
        await supabase.from('log_aktivitas').insert({
          dokumen_id: arsip.dokumen_id,
          user_id: null, // system action
          aksi: 'AUTO_VERIFIKASI_PENYUSUTAN',
          catatan: 'Auto-transition via cron',
          step_urutan: null,
        })

        verifikasiProcessed++
      }
    }

    // ── Phase 2: Usul Musnah ─────────────────────────────────────────
    // Arsip INAKTIF dengan masa_inaktif_berakhir <= today → USUL_MUSNAH
    const { data: inaktifExpired, error: inaktifError } = await supabase
      .from('arsip')
      .select('id, dokumen_id')
      .eq('status_arsip', 'INAKTIF')
      .eq('is_ditolak', false)
      .lte('masa_inaktif_berakhir', today)

    if (inaktifError) {
      errors.push(`[Phase2] Query error: ${inaktifError.message}`)
    }

    let musnahProcessed = 0
    if (inaktifExpired && inaktifExpired.length > 0) {
      for (const arsip of inaktifExpired) {
        // Cek belum ada musnah aktif
        const { data: existing } = await supabase
          .from('arsip_usul_musnah')
          .select('id')
          .eq('arsip_id', arsip.id)
          .single()

        if (existing) continue

        // Insert musnah record
        const { error: insertError } = await supabase
          .from('arsip_usul_musnah')
          .insert({
            arsip_id: arsip.id,
            status: 'MENUNGGU',
            catatan: 'Auto-transition via cron',
            diusulkan_oleh: null,
          })

        if (insertError) {
          if (insertError.code === '23505') {
            continue
          }
          errors.push(`[Phase2] Insert error for arsip ${arsip.id}: ${insertError.message}`)
          continue
        }

        // Update status
        const { error: updateError } = await supabase
          .from('arsip')
          .update({ status_arsip: 'USUL_MUSNAH' })
          .eq('id', arsip.id)

        if (updateError) {
          errors.push(`[Phase2] Update error for arsip ${arsip.id}: ${updateError.message}`)
          continue
        }

        // Insert log
        await supabase.from('log_aktivitas').insert({
          dokumen_id: arsip.dokumen_id,
          user_id: null,
          aksi: 'AUTO_USUL_MUSNAH',
          catatan: 'Auto-transition via cron',
          step_urutan: null,
        })

        musnahProcessed++
      }
    }

    const result = {
      timestamp: new Date().toISOString(),
      verifikasi_penyusutan: { processed: verifikasiProcessed },
      usul_musnah: { processed: musnahProcessed },
      errors,
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
