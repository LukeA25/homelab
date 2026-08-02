import type {
  AskResponse,
  Bookmark,
  ChapterRef,
  Highlight,
  NoteDoc,
  Paragraph,
  ReadingPosition,
  SearchResult,
  SectionNode,
  Topic,
  Work,
} from "./types";

export const BIBLE_ID = "bible-rsvce";

export const WORKS: Work[] = [
  {
    id: BIBLE_ID,
    title: "Holy Bible (RSV-CE)",
    shortTitle: "Bible",
    author: "Various",
    kind: "bible",
    description: "Mock stand-in for your purchased translation.",
  },
  {
    id: "ccc",
    title: "Catechism of the Catholic Church",
    shortTitle: "Catechism",
    author: "Magisterium",
    kind: "catechism",
    description: "Paragraph-addressable catechesis.",
  },
  {
    id: "summa",
    title: "Summa Theologiae",
    shortTitle: "Summa",
    author: "St. Thomas Aquinas",
    kind: "summa",
    description: "Part → Question → Article structure.",
  },
  {
    id: "confessions",
    title: "Confessions",
    shortTitle: "Confessions",
    author: "St. Augustine",
    kind: "fathers",
    description: "Personal reading and spiritual formation.",
  },
];

export const SECTIONS: Record<string, SectionNode[]> = {
  [BIBLE_ID]: [
    {
      id: "ps",
      title: "Psalms",
      children: [
        { id: "ps.23", title: "Psalm 23" },
        { id: "ps.27", title: "Psalm 27" },
        { id: "ps.51", title: "Psalm 51" },
      ],
    },
    {
      id: "jn",
      title: "John",
      children: [
        { id: "jn.1", title: "John 1" },
        { id: "jn.15", title: "John 15" },
      ],
    },
    {
      id: "rom",
      title: "Romans",
      children: [{ id: "rom.5", title: "Romans 5" }],
    },
  ],
  ccc: [
    {
      id: "ccc.3.1",
      title: "Life in Christ",
      children: [
        { id: "ccc.1803", title: "¶1803–1811 Virtue" },
        { id: "ccc.1846", title: "¶1846–1848 Mercy" },
      ],
    },
  ],
  summa: [
    {
      id: "st.i-ii",
      title: "Prima Secundae",
      children: [
        { id: "st.i-ii.q55", title: "Q.55 Of the virtues" },
        { id: "st.i-ii.q62", title: "Q.62 Of the theological virtues" },
      ],
    },
  ],
  confessions: [
    {
      id: "conf.1",
      title: "Book I",
      children: [{ id: "conf.1.1", title: "I.1" }],
    },
  ],
};

export const PARAGRAPHS: Record<string, Paragraph[]> = {
  "ps.23": [
    { id: "ps.23.1", locusId: "Ps.23.1", label: "1", verse: 1, text: "The Lord is my shepherd, I shall not want;" },
    { id: "ps.23.2", locusId: "Ps.23.2", label: "2", verse: 2, text: "he makes me lie down in green pastures. He leads me beside still waters;" },
    { id: "ps.23.3", locusId: "Ps.23.3", label: "3", verse: 3, text: "he restores my soul. He leads me in paths of righteousness for his name’s sake." },
    { id: "ps.23.4", locusId: "Ps.23.4", label: "4", verse: 4, text: "Even though I walk through the valley of the shadow of death, I fear no evil; for thou art with me; thy rod and thy staff, they comfort me." },
    { id: "ps.23.5", locusId: "Ps.23.5", label: "5", verse: 5, text: "Thou preparest a table before me in the presence of my enemies; thou anointest my head with oil, my cup overflows." },
    { id: "ps.23.6", locusId: "Ps.23.6", label: "6", verse: 6, text: "Surely goodness and mercy shall follow me all the days of my life; and I shall dwell in the house of the Lord for ever." },
  ],
  "ps.27": [
    { id: "ps.27.1", locusId: "Ps.27.1", label: "1", verse: 1, text: "The Lord is my light and my salvation; whom shall I fear? The Lord is the stronghold of my life; of whom shall I be afraid?" },
    { id: "ps.27.4", locusId: "Ps.27.4", label: "4", verse: 4, text: "One thing have I asked of the Lord, that will I seek after; that I may dwell in the house of the Lord all the days of my life, to behold the beauty of the Lord, and to inquire in his temple." },
  ],
  "ps.51": [
    { id: "ps.51.10", locusId: "Ps.51.10", label: "10", verse: 10, text: "Create in me a clean heart, O God, and put a new and right spirit within me." },
  ],
  "jn.1": [
    { id: "jn.1.1", locusId: "Jn.1.1", label: "1", verse: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
    { id: "jn.1.14", locusId: "Jn.1.14", label: "14", verse: 14, text: "And the Word became flesh and dwelt among us, full of grace and truth; we have beheld his glory, glory as of the only Son from the Father." },
  ],
  "jn.15": [
    { id: "jn.15.5", locusId: "Jn.15.5", label: "5", verse: 5, text: "I am the vine, you are the branches. He who abides in me, and I in him, he it is that bears much fruit, for apart from me you can do nothing." },
  ],
  "rom.5": [
    { id: "rom.5.5", locusId: "Rom.5.5", label: "5", verse: 5, text: "and hope does not disappoint us, because God’s love has been poured into our hearts through the Holy Spirit which has been given to us." },
  ],
  "ccc.1803": [
    { id: "ccc.p1803", locusId: "CCC.1803", label: "¶1803", text: "“Whatever is true, whatever is honorable, whatever is just, whatever is pure, whatever is lovely, whatever is gracious, if there is any excellence, if there is anything worthy of praise, think about these things.” A virtue is an habitual and firm disposition to do the good." },
    { id: "ccc.p1804", locusId: "CCC.1804", label: "¶1804", text: "Human virtues are firm attitudes, stable dispositions, habitual perfections of intellect and will that govern our actions, order our passions, and guide our conduct according to reason and faith." },
    { id: "ccc.p1810", locusId: "CCC.1810", label: "¶1810", text: "Human virtues acquired by education, by deliberate acts and by a perseverance ever-renewed in repeated efforts are purified and elevated by divine grace." },
  ],
  "ccc.1846": [
    { id: "ccc.p1847", locusId: "CCC.1847", label: "¶1847", text: "“God created us without us: but he did not will to save us without us.” To receive his mercy, we must admit our faults." },
  ],
  "st.i-ii.q55": [
    { id: "st.q55.a1", locusId: "ST.I-II.Q55.A1", label: "Q.55 a.1", text: "Virtue denotes a certain perfection of a power. Now a thing’s perfection is considered chiefly in regard to its end. But the end of power is act. Wherefore power is said to be perfect, according as it is determinate to its act." },
    { id: "st.q55.a4", locusId: "ST.I-II.Q55.A4", label: "Q.55 a.4", text: "Virtue which is referred to being is not the same as virtue which is referred to operation: for some things have being that have no operation. Hence it is clear that human virtue, of which we are speaking now, cannot belong to the body, but is referred only to the soul." },
  ],
  "st.i-ii.q62": [
    { id: "st.q62.a1", locusId: "ST.I-II.Q62.A1", label: "Q.62 a.1", text: "Man is perfected by virtue, for those actions whereby he is directed to happiness. Now man’s happiness is twofold. One is proportionate to human nature, and this he can get by means of his natural principles. The other is a happiness surpassing man’s nature, and which man can obtain by the power of God alone, by a kind of participation of the Godhead." },
    { id: "st.q62.a3", locusId: "ST.I-II.Q62.A3", label: "Q.62 a.3", text: "Faith, hope, and charity are called theological virtues because they have God for their object." },
  ],
  "conf.1.1": [
    { id: "conf.1.1.1", locusId: "Conf.I.1", label: "I.1", text: "Great art Thou, O Lord, and greatly to be praised; great is Thy power, and Thy wisdom infinite. And Thee would man praise; man, but a particle of Thy creation; man, that bears about him his mortality…" },
  ],
};

/** Flat ordered list of Bible chapters for swipe navigation. */
export function bibleChapters(): ChapterRef[] {
  const out: ChapterRef[] = [];
  for (const book of SECTIONS[BIBLE_ID] ?? []) {
    for (const ch of book.children ?? []) {
      out.push({
        workId: BIBLE_ID,
        sectionId: ch.id,
        bookTitle: book.title,
        chapterTitle: ch.title,
      });
    }
  }
  return out;
}

export function chapterIndex(sectionId: string): number {
  return bibleChapters().findIndex((c) => c.sectionId === sectionId);
}

export function adjacentChapter(sectionId: string, delta: number): ChapterRef | null {
  const list = bibleChapters();
  const i = list.findIndex((c) => c.sectionId === sectionId);
  if (i < 0) return null;
  return list[i + delta] ?? null;
}

export const INITIAL_POSITIONS: ReadingPosition[] = [
  { workId: BIBLE_ID, sectionId: "ps.23", paragraphId: "ps.23.1", updatedAt: "2026-07-28T10:00:00Z" },
  { workId: "ccc", sectionId: "ccc.1803", paragraphId: "ccc.p1803", updatedAt: "2026-07-27T18:00:00Z" },
];

export const INITIAL_BOOKMARKS: Bookmark[] = [
  {
    id: "bm1",
    workId: BIBLE_ID,
    paragraphId: "ps.23.1",
    locusId: "Ps.23.1",
    label: "Psalm 23:1",
    note: "Shepherd / still waters",
    createdAt: "2026-07-10T09:00:00Z",
  },
  {
    id: "bm2",
    workId: BIBLE_ID,
    paragraphId: "ps.27.1",
    locusId: "Ps.27.1",
    label: "Psalm 27:1",
    createdAt: "2026-07-12T09:00:00Z",
  },
];

export const INITIAL_HIGHLIGHTS: Highlight[] = [
  {
    id: "hl1",
    workId: BIBLE_ID,
    paragraphId: "ps.23.1",
    locusId: "Ps.23.1",
    color: "amber",
    createdAt: "2026-07-15T12:00:00Z",
  },
];

export const INITIAL_NOTES: NoteDoc[] = [
  {
    id: "n1",
    title: "Virtue as habitual disposition",
    section: "apologetics",
    body: `# Virtue

Firm disposition to the good — not a single act.

> A virtue is an habitual and firm disposition to do the good.

// Connect to Aquinas on habit.

[CCC ¶1803](studydesk://CCC.1803)
`,
    createdAt: "2026-07-15T12:30:00Z",
    updatedAt: "2026-07-15T12:30:00Z",
  },
  {
    id: "n2",
    title: "Still waters",
    section: "personal",
    body: `Return here when restless.

[Psalm 23:2](studydesk://Ps.23.2)
`,
    createdAt: "2026-07-10T09:15:00Z",
    updatedAt: "2026-07-10T09:15:00Z",
  },
];

export const INITIAL_TOPICS: Topic[] = [
  {
    id: "d1",
    title: "Infused virtue",
    summary:
      "Theological virtues are infused by God; human virtues can be acquired and elevated by grace.",
    keyPoints: [
      "Virtue = habitual perfection of a power toward its act (ST I-II Q.55).",
      "Theological virtues have God as object (faith, hope, charity).",
      "CCC: human virtues purified and elevated by grace (¶1810).",
    ],
    linkedSources: [
      { workId: "summa", locusId: "ST.I-II.Q55.A1", label: "Summa I-II Q.55 a.1" },
      { workId: "summa", locusId: "ST.I-II.Q62.A1", label: "Summa I-II Q.62 a.1" },
      { workId: "ccc", locusId: "CCC.1803", label: "CCC ¶1803" },
      { workId: "ccc", locusId: "CCC.1810", label: "CCC ¶1810" },
    ],
    notes: "Use when someone reduces Christianity to moralism or willpower alone.",
    lastReviewedAt: "2026-06-01T12:00:00Z",
    createdAt: "2026-05-01T12:00:00Z",
    updatedAt: "2026-06-01T12:00:00Z",
  },
  {
    id: "d2",
    title: "Problem of evil (brief)",
    summary: "Placeholder topic for brush-up practice — expand later.",
    keyPoints: [
      "Distinguish physical evil, moral evil, and the question of God’s permission.",
      "Hope does not disappoint — love poured into hearts (Rom 5:5).",
    ],
    linkedSources: [
      { workId: BIBLE_ID, locusId: "Rom.5.5", label: "Romans 5:5" },
      { workId: "ccc", locusId: "CCC.1847", label: "CCC ¶1847" },
    ],
    notes: "Needs more fathers and a clearer free-will thread.",
    lastReviewedAt: "2026-04-01T12:00:00Z",
    createdAt: "2026-03-15T12:00:00Z",
    updatedAt: "2026-04-01T12:00:00Z",
  },
  {
    id: "d3",
    title: "Incarnation — Word made flesh",
    summary: "Jn 1:14 as the hinge for divinity and humanity of Christ.",
    keyPoints: ["The Word was God (Jn 1:1).", "The Word became flesh (Jn 1:14)."],
    linkedSources: [
      { workId: BIBLE_ID, locusId: "Jn.1.1", label: "John 1:1" },
      { workId: BIBLE_ID, locusId: "Jn.1.14", label: "John 1:14" },
    ],
    notes: "",
    lastReviewedAt: "2026-07-25T12:00:00Z",
    createdAt: "2026-07-01T12:00:00Z",
    updatedAt: "2026-07-25T12:00:00Z",
  },
];

export const BRUSH_UP_WEEKS = 4;

export function weeksSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return (now.getTime() - new Date(iso).getTime()) / (7 * 24 * 60 * 60 * 1000);
}

export function brushUpTopics(topics: Topic[], now = new Date()): Topic[] {
  return topics
    .filter((d) => {
      const w = weeksSince(d.lastReviewedAt, now);
      return w === null || w >= BRUSH_UP_WEEKS;
    })
    .sort((a, b) => {
      const aw = weeksSince(a.lastReviewedAt, now) ?? 999;
      const bw = weeksSince(b.lastReviewedAt, now) ?? 999;
      return bw - aw;
    });
}

export function findParagraphByLocus(locusId: string): {
  workId: string;
  sectionId: string;
  paragraph: Paragraph;
} | null {
  for (const [sectionId, paras] of Object.entries(PARAGRAPHS)) {
    const paragraph = paras.find((p) => p.locusId === locusId || p.id === locusId);
    if (!paragraph) continue;
    const workId =
      WORKS.find((w) =>
        (SECTIONS[w.id] ?? []).some(
          (s) => s.id === sectionId || s.children?.some((c) => c.id === sectionId),
        ),
      )?.id ?? guessWorkFromSection(sectionId);
    return { workId, sectionId, paragraph };
  }
  return null;
}

function guessWorkFromSection(sectionId: string): string {
  if (sectionId.startsWith("ps") || sectionId.startsWith("jn") || sectionId.startsWith("rom")) {
    return BIBLE_ID;
  }
  if (sectionId.startsWith("ccc")) return "ccc";
  if (sectionId.startsWith("st")) return "summa";
  if (sectionId.startsWith("conf")) return "confessions";
  return BIBLE_ID;
}

export function sectionTitle(workId: string, sectionId: string): string {
  const roots = SECTIONS[workId] ?? [];
  for (const root of roots) {
    if (root.id === sectionId) return root.title;
    const child = root.children?.find((c) => c.id === sectionId);
    if (child) return child.title;
  }
  return sectionId;
}

export function mockSearch(query: string, notes: NoteDoc[], topics: Topic[]): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: SearchResult[] = [];

  for (const [sectionId, paras] of Object.entries(PARAGRAPHS)) {
    for (const p of paras) {
      if (p.text.toLowerCase().includes(q) || p.locusId.toLowerCase().includes(q)) {
        const hit = findParagraphByLocus(p.locusId);
        const work = WORKS.find((w) => w.id === hit?.workId);
        results.push({
          id: `sr-${p.id}`,
          kind: work?.kind === "bible" ? "scripture" : "book",
          title: `${work?.shortTitle ?? "Work"} · ${p.label}`,
          snippet: p.text.slice(0, 140),
          locus: {
            workId: hit?.workId ?? guessWorkFromSection(sectionId),
            locusId: p.locusId,
            label: p.locusId,
          },
        });
      }
    }
  }

  for (const n of notes) {
    const blob = `${n.title}\n${n.body}`.toLowerCase();
    if (blob.includes(q)) {
      results.push({
        id: `sr-note-${n.id}`,
        kind: "note",
        title: n.title,
        snippet: n.body.trim().slice(0, 140),
        noteId: n.id,
      });
    }
  }

  for (const d of topics) {
    const blob = [d.title, d.summary, ...d.keyPoints, d.notes].join(" ").toLowerCase();
    if (blob.includes(q)) {
      results.push({
        id: `sr-topic-${d.id}`,
        kind: "topic",
        title: d.title,
        snippet: d.summary.slice(0, 140),
        topicId: d.id,
      });
    }
  }

  return results;
}

export function mockAsk(question: string): AskResponse {
  const q = question.toLowerCase();
  const infused = q.includes("virtue") || q.includes("infused") || q.includes("habit");
  const anxious =
    q.includes("anxious") ||
    q.includes("afraid") ||
    q.includes("feel") ||
    q.includes("worried") ||
    q.includes("restless");

  if (anxious) {
    return {
      answer: "Here are quiet places in your library.",
      resources: [
        { locus: { workId: BIBLE_ID, locusId: "Ps.23.1", label: "Psalm 23" }, reason: "Shepherd, still waters" },
        { locus: { workId: BIBLE_ID, locusId: "Ps.27.1", label: "Psalm 27:1" }, reason: "Light and salvation" },
        { locus: { workId: "confessions", locusId: "Conf.I.1", label: "Confessions I.1" }, reason: "Praise when words are hard" },
      ],
      citations: [],
      bullets: [],
    };
  }

  if (infused) {
    return {
      answer: "Infused vs acquired virtue in your library:",
      resources: [
        { locus: { workId: "ccc", locusId: "CCC.1803", label: "CCC ¶1803" }, reason: "Definition of virtue" },
        { locus: { workId: "summa", locusId: "ST.I-II.Q55.A1", label: "Summa I-II Q.55 a.1" }, reason: "Perfection of a power" },
      ],
      citations: [
        { locus: { workId: "summa", locusId: "ST.I-II.Q62.A1", label: "Summa I-II Q.62 a.1" }, snippet: "Happiness surpassing nature… by the power of God alone…" },
        { locus: { workId: "ccc", locusId: "CCC.1810", label: "CCC ¶1810" }, snippet: "Human virtues… purified and elevated by divine grace." },
      ],
      bullets: [
        "Acquired human virtues perfect natural powers through repeated acts.",
        "Theological virtues are infused and have God as their object.",
        "Grace elevates even acquired virtue (CCC ¶1810).",
      ],
    };
  }

  return {
    answer: "A few related places in your library:",
    resources: [
      { locus: { workId: BIBLE_ID, locusId: "Jn.15.5", label: "John 15:5" }, reason: "Abiding / fruit" },
      { locus: { workId: "ccc", locusId: "CCC.1803", label: "CCC ¶1803" }, reason: "Virtue" },
    ],
    citations: [],
    bullets: [],
  };
}
