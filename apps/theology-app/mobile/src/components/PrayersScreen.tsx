import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import { getPrayer, getReadings, listPrayers } from "../lib/api";
import type { PrayerItem, ReadingsDay } from "../lib/types";
import { colors } from "../theme/colors";
import { Touchable } from "./ui/Touchable";

type PrayersScreenProps = {
  view: string | null;
  onNavigate: (view: string | null) => void;
  onOpenBibleSection: (
    sectionId: string,
    title: string,
    focus?: {
      focusLocusId?: string | null;
      verseStart?: number | null;
      verseEnd?: number | null;
      verses?: number[] | null;
    },
  ) => void;
};

export function PrayersScreen({
  view,
  onNavigate,
  onOpenBibleSection,
}: PrayersScreenProps) {
  const [items, setItems] = useState<PrayerItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listPrayers();
        if (!cancelled) {
          setItems(rows);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (view === "mass-readings" || view === "readings") {
    return (
      <ReadingsView
        onBack={() => onNavigate(null)}
        onOpenBibleSection={onOpenBibleSection}
      />
    );
  }

  if (view) {
    return <PrayerDetailView prayerId={view} onBack={() => onNavigate(null)} />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
    >
      <Text style={{ color: colors.text, fontSize: 28, fontFamily: "Fraunces_600SemiBold" }}>
        Prayers
      </Text>
      <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8 }}>
        Daily readings and fixed prayers.
      </Text>
      {error ? <Text style={{ color: colors.muted, fontSize: 14, marginTop: 16 }}>{error}</Text> : null}
      {loading ? <Text style={{ color: colors.muted, fontSize: 14, marginTop: 24 }}>Loading…</Text> : null}
      <View
        style={{
          marginTop: 24,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: "hidden",
        }}
      >
        {items.map((item, idx) => (
          <Touchable
            key={item.id}
            variant="card"
            onPress={() => onNavigate(item.id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderTopWidth: idx > 0 ? 1 : 0,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontFamily: "Figtree_600SemiBold" }}>
                {item.title}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{item.subtitle}</Text>
            </View>
            <ChevronRight color={colors.muted} size={16} />
          </Touchable>
        ))}
      </View>
    </ScrollView>
  );
}

function ReadingsView({
  onBack,
  onOpenBibleSection,
}: {
  onBack: () => void;
  onOpenBibleSection: PrayersScreenProps["onOpenBibleSection"];
}) {
  const [day, setDay] = useState<ReadingsDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getReadings();
        if (!cancelled) setDay(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
    >
      <Touchable variant="ghost" onPress={onBack} style={{ alignSelf: "flex-start", paddingVertical: 4 }}>
        <Text style={{ color: colors.accent, fontSize: 14, fontFamily: "Figtree_500Medium" }}>
          ← Prayers
        </Text>
      </Touchable>
      <Text
        style={{
          color: colors.text,
          fontSize: 28,
          fontFamily: "Fraunces_600SemiBold",
          marginTop: 12,
        }}
      >
        Mass Readings
      </Text>
      {error ? <Text style={{ color: colors.muted, fontSize: 14, marginTop: 16 }}>{error}</Text> : null}
      {!day && !error ? (
        <Text style={{ color: colors.muted, fontSize: 14, marginTop: 24 }}>Loading…</Text>
      ) : null}
      {day ? (
        <>
          <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8 }}>
            {day.date}
            {day.celebration ? ` · ${day.celebration}` : ""}
            {day.season ? ` · ${day.season}` : ""}
          </Text>
          {day.error ? (
            <View
              style={{
                marginTop: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 14 }}>{day.error}</Text>
            </View>
          ) : null}
          <View
            style={{
              marginTop: 24,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              overflow: "hidden",
            }}
          >
            {day.readings.map((r, idx) => (
              <Touchable
                key={`${r.type}-${r.reference}`}
                variant="card"
                disabled={!r.sectionId}
                onPress={() => {
                  if (r.sectionId) {
                    onOpenBibleSection(r.sectionId, r.reference, {
                      focusLocusId: r.focusLocusId,
                      verseStart: r.verseStart,
                      verseEnd: r.verseEnd,
                      verses: r.verses,
                    });
                  }
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderTopWidth: idx > 0 ? 1 : 0,
                  borderTopColor: colors.border,
                  opacity: r.sectionId ? 1 : 0.5,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: 11,
                      fontFamily: "Figtree_600SemiBold",
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                    }}
                  >
                    {r.label || r.type}
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      fontFamily: "Figtree_600SemiBold",
                      marginTop: 4,
                    }}
                  >
                    {r.reference}
                  </Text>
                </View>
                {r.sectionId ? <ChevronRight color={colors.muted} size={16} /> : null}
              </Touchable>
            ))}
          </View>
          {!day.readings.length && !day.error ? (
            <Text style={{ color: colors.muted, fontSize: 14, marginTop: 24 }}>
              No readings returned for this date.
            </Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function PrayerDetailView({
  prayerId,
  onBack,
}: {
  prayerId: string;
  onBack: () => void;
}) {
  const [prayer, setPrayer] = useState<PrayerItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getPrayer(prayerId);
        if (!cancelled) setPrayer(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prayerId]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
    >
      <Touchable variant="ghost" onPress={onBack} style={{ alignSelf: "flex-start", paddingVertical: 4 }}>
        <Text style={{ color: colors.accent, fontSize: 14, fontFamily: "Figtree_500Medium" }}>
          ← Prayers
        </Text>
      </Touchable>
      {error ? <Text style={{ color: colors.muted, fontSize: 14, marginTop: 16 }}>{error}</Text> : null}
      {!prayer && !error ? (
        <Text style={{ color: colors.muted, fontSize: 14, marginTop: 24 }}>Loading…</Text>
      ) : null}
      {prayer ? (
        <>
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontFamily: "Fraunces_600SemiBold",
              marginTop: 12,
            }}
          >
            {prayer.title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>{prayer.subtitle}</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: 16,
              fontFamily: "SourceSerif4_400Regular",
              lineHeight: 26,
              marginTop: 24,
            }}
          >
            {prayer.body}
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}
