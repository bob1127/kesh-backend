type ZipCodeResult = [string, string, string]

type TwZipModule = {
  getZipCodeByCity: (city: string, district: string) => ZipCodeResult | undefined
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getZipCodeByCity } = require("@simoko/tw-zip") as TwZipModule

/** 臺 → 台，順豐 / tw-zip 資料集使用「台」 */
export function normalizeTwCityName(name?: string): string {
  return (name ?? "").replace(/^臺/, "台").trim()
}

/**
 * 由 Medusa 訂單地址推導台灣 3 碼郵遞區號。
 * province = 縣市、city = 鄉鎮市區（checkout 慣例）
 */
export function resolveTwPostalCode(input: {
  postal_code?: string
  province?: string
  city?: string
  country_code?: string
}): string | undefined {
  const country = (input.country_code ?? "TW").toUpperCase()
  if (country !== "TW") return input.postal_code?.trim() || undefined

  const existing = input.postal_code?.trim()
  if (existing) return existing

  const county = normalizeTwCityName(input.province)
  const district = (input.city ?? "").trim()
  if (!county || !district) return undefined

  const hit = getZipCodeByCity(county, district)
  return hit?.[0]
}
