import AsyncStorage from "@react-native-async-storage/async-storage";

const SIZE_KEY = "study-desk-text-size";
const BIBLE_SECTION_KEY = "study-desk-bible-section";

export async function readTextSize(): Promise<number> {
  const v = Number(await AsyncStorage.getItem(SIZE_KEY));
  return Number.isFinite(v) && v >= 0.95 && v <= 1.6 ? v : 1.25;
}

export async function readBibleSection(): Promise<string> {
  return (await AsyncStorage.getItem(BIBLE_SECTION_KEY)) || "ps.23";
}

export async function writeBibleSection(sectionId: string): Promise<void> {
  await AsyncStorage.setItem(BIBLE_SECTION_KEY, sectionId);
}
