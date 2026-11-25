// CV template. Facts come from cvdata.json beside this file (Typst json()).
// Renderer: typst 0.13.1 + Charter. No personal record is stored here.
// Build: typst compile --font-path fonts cv.typ out.pdf
// Do not put a phone number in this file or in the PDF.

#let data = json("cvdata.json")
#let doc = data.document

#set document(
  title: doc.title,
  author: doc.author,
  description: doc.description,
  keywords: doc.keywords,
)

// ---- Tokens -------------------------------------------------------------
#let ink    = rgb("#1b1d22")
#let muted  = rgb("#5a5e66")
#let accent = rgb("#7a2a2a")   // section heads only
#let rule   = luma(78%)
#let contact = rgb("#8a3a3a")  // header contact lines only

#let gap-section = 14pt   // above every section head
#let gap-head    = 9pt    // section rule -> first entry
#let gap-entry   = 10pt   // between entries
#let gap-bullet  = 5.5pt    // between bullets
#let gap-line    = 5pt    // title -> bullets, bullet -> its link line

#let bullet-col  = 0.95em // hanging indent: wrapped text aligns here
#let label-col   = 41mm   // skills label column

#set page(paper: "a4", margin: (x: 17mm, top: 13mm, bottom: 12mm))
#set text(font: "Charter", size: 10pt, fill: ink, hyphenate: false, lang: "en",
          number-width: "tabular")
// line pitch ≈ cap-height (0.67em) + leading ≈ 1.35em
#set par(leading: 0.72em, spacing: 0pt, justify: false)
// links inherit the surrounding colour (muted in small lines)

// ---- Components ---------------------------------------------------------
#let small(t) = text(8.8pt, fill: muted)[#t]
#let L(url, label) = link(url)[#label]
#let prose(s) = s.replace("'", "’")

#let section(t) = block(above: gap-section, below: gap-head, sticky: true, breakable: false)[
  #text(9.4pt, weight: "bold", fill: accent, tracking: 0.08em)[#upper(t)]
  #v(3pt, weak: false)
  #line(length: 100%, stroke: 0.5pt + rule)
]

// Title (left) and dates (right) share one paragraph => one baseline.
#let head(title, org, d) = block(breakable: false, sticky: true, below: gap-line)[
  #text(weight: "bold")[#title]#if org != none [#text(fill: muted)[ #sym.dash.en #org]]
  #h(1fr) #small(d)
]

// Bullet with true hanging indent; optional link line under the text.
#let gap-project = 7pt   // between project bullets that carry a link line
#let item(body, links: ()) = block(above: if links.len() > 0 { gap-project } else { gap-bullet }, below: 0pt, breakable: false,
  grid(columns: (bullet-col, 1fr), row-gutter: 0pt,
    text(fill: muted)[•],
    {
      body
      if links.len() > 0 {
        block(above: gap-line, below: 0pt, small(links.join([#h(0.45em)·#h(0.45em)])))
      }
    }))

// Indented note line (tools, context) aligned with bullet text.
#let note(t) = block(above: gap-bullet, below: 0pt,
  grid(columns: (bullet-col, 1fr), [], small(t)))

#let entry(body) = block(above: gap-entry, below: 0pt, breakable: false, body)

#let sub(t) = block(above: gap-entry + 2pt, below: gap-line, sticky: true)[
  #text(weight: "bold", fill: muted)[#t]
]

#let link-spans(items) = items.map(it => L(it.url, it.label))

#let item-body(it) = {
  if it.at("lead", default: none) != none {
    [*#it.lead*#prose(it.text)]
  } else {
    prose(it.text)
  }
}

#let render-item(it) = item(links: link-spans(it.at("links", default: ())))[#item-body(it)]

#let sep = [ #h(0.5em)·#h(0.5em) ]
#let line-spans(items) = items.map(it => {
  let prefix = it.at("prefix", default: none)
  let body = if it.at("href", default: none) != none { L(it.href, it.text) } else { it.text }
  if prefix != none [#prefix#body] else { body }
}).join(sep)

// ---- Header -------------------------------------------------------------
#align(center)[
#text(21pt, weight: "bold")[#data.name]

#v(9pt)

#text(11pt, fill: muted)[#data.headline]

#v(10pt)

#text(8.8pt, fill: contact)[#line-spans(data.contact_line)]

#v(7pt)

#text(8.8pt, fill: contact)[#line-spans(data.social_line)]

#v(7pt)

#text(8.8pt, fill: contact)[#line-spans(data.profile_line)]
]

// ---- Summary ------------------------------------------------------------
#section("Summary")
#prose(data.summary)

// ---- Skills -------------------------------------------------------------
#section("Skills")
#let skills = data.skills
#grid(columns: (label-col, 1fr), column-gutter: 0pt, row-gutter: 6.5pt,
  ..skills.map(row => (text(weight: "bold")[#row.at(0)], row.at(1))).flatten())

// ---- Independent work ---------------------------------------------------
#section("Independent Work")
#let indie = data.independent
#block(sticky: true)[
  #head(indie.title, indie.at("org", default: none), indie.dates)
  #small[#prose(indie.note)]
  #block(above: 3pt, below: 0pt, small(L(indie.note_link.url, indie.note_link.label)))
]

#for it in indie.items { render-item(it) }

// ---- Experience ---------------------------------------------------------
#section("Experience")
#for job in data.experience {
  entry[
    #head(job.title, job.at("org", default: none), job.dates)
    #for it in job.items { render-item(it) }
    #if job.at("note", default: none) != none { note(prose(job.note)) }
  ]
}

// ---- Profile in brief (ATS) -------------------------------------------------
#section("Profile in Brief")
#prose(data.profile_in_brief)

// ---- Publications and certification ---------------------------------------
#section("Publications and Certification")
#for pub in data.publications {
  entry[
    #head(pub.title, pub.at("org", default: none), pub.dates)
    #if pub.at("detail", default: none) != none {
      small[
        #pub.detail.at("venue")
        #if pub.detail.at("link", default: none) != none [
          #h(0.45em)·#h(0.45em) #L(pub.detail.link.url, pub.detail.link.label)
        ]
      ]
    }
  ]
}

// ---- Education -----------------------------------------------------------
#section("Education")
#for ed in data.education {
  entry[#head(ed.title, ed.at("org", default: none), ed.dates)]
}
