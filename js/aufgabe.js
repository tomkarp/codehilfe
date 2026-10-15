/* ============================================================
 * Aufgabe – stellt eine gespeicherte Aufgabe dar: Überschrift,
 * Aufgabenstellung und die CodeHilfe selbst.
 *
 * Die CodeHilfe entsteht wie in einer von Hand geschriebenen Seite: ein
 * <pre class="quelltext codehilfe"> mit <code class="language-…">.
 * Prism hebt ihn hervor und legt den Copy-Knopf an, danach ersetzt
 * CodeHilfe.starte() den Block durch das Widget.
 *
 * Alle Texte werden als Text eingesetzt, nie als HTML.
 * ============================================================ */
(function () {
	"use strict";

	function element(tag, klasse, inhalt) {
		var el = document.createElement(tag);
		if (klasse) {
			el.className = klasse;
		}
		if (inhalt !== undefined) {
			el.textContent = inhalt;
		}
		return el;
	}

	/* Inline-Auszeichnung: `Code` und **fett** */
	function fuegeInlineEin(ziel, text) {
		var muster = /`([^`]+)`|\*\*([^*]+)\*\*/g;
		var pos = 0;
		var treffer;
		while ((treffer = muster.exec(text)) !== null) {
			if (treffer.index > pos) {
				ziel.appendChild(document.createTextNode(
					text.slice(pos, treffer.index)));
			}
			if (treffer[1] !== undefined) {
				ziel.appendChild(element("code", "", treffer[1]));
			} else {
				ziel.appendChild(element("strong", "", treffer[2]));
			}
			pos = treffer.index + treffer[0].length;
		}
		if (pos < text.length) {
			ziel.appendChild(document.createTextNode(text.slice(pos)));
		}
	}

	/* Zeilen eines Absatzes; einfache Zeilenumbrüche bleiben erhalten. */
	function absatz(zeilen) {
		var p = element("p");
		zeilen.forEach(function (zeile, i) {
			if (i > 0) {
				p.appendChild(element("br"));
			}
			fuegeInlineEin(p, zeile);
		});
		return p;
	}

	/* Aufgabenstellung mit einer kleinen, sicheren Auszeichnung:
	 *   Leerzeile        neuer Absatz
	 *   `Code`           Code im Text
	 *   **fett**         Hervorhebung
	 *   - Punkt          Aufzählung (auch "* Punkt")
	 *   1. Schritt       nummerierte Liste
	 *   ``` … ```        Block, z.B. für eine erwartete Ausgabe */
	function formatiereText(text) {
		var fragment = document.createDocumentFragment();
		var zeilen = text.replace(/\r\n?/g, "\n").split("\n");
		var absatzZeilen = [];
		var liste = null;
		var block = null;

		function beendeAbsatz() {
			if (absatzZeilen.length) {
				fragment.appendChild(absatz(absatzZeilen));
				absatzZeilen = [];
			}
		}

		function beendeListe() {
			liste = null;
		}

		zeilen.forEach(function (zeile) {
			if (block) {
				if (/^\s*```\s*$/.test(zeile)) {
					block.textContent = block._zeilen.join("\n");
					fragment.appendChild(block);
					block = null;
				} else {
					block._zeilen.push(zeile);
				}
				return;
			}
			if (/^\s*```/.test(zeile)) {
				beendeAbsatz();
				beendeListe();
				block = element("pre", "ausgabe");
				block._zeilen = [];
				return;
			}
			var punkt = zeile.match(/^\s*[-*]\s+(.*)$/);
			var nummer = zeile.match(/^\s*\d+[.)]\s+(.*)$/);
			if (punkt || nummer) {
				beendeAbsatz();
				var art = punkt ? "ul" : "ol";
				if (!liste || liste.tagName.toLowerCase() !== art) {
					liste = element(art);
					fragment.appendChild(liste);
				}
				var li = element("li");
				fuegeInlineEin(li, (punkt || nummer)[1]);
				liste.appendChild(li);
				return;
			}
			if (zeile.trim() === "") {
				beendeAbsatz();
				beendeListe();
				return;
			}
			beendeListe();
			absatzZeilen.push(zeile.trim());
		});
		if (block) {
			block.textContent = block._zeilen.join("\n");
			fragment.appendChild(block);
		}
		beendeAbsatz();
		return fragment;
	}

	/* Das pre-Element, wie es auch von Hand notiert würde (siehe Hilfe,
	 * "In eigene Webseiten einbinden"). */
	function codehilfeElement(daten) {
		var pre = element("pre", "quelltext codehilfe");
		if (daten.zeilenSortieren) {
			pre.setAttribute("data-zeilen-sortieren", "");
			if (daten.zeilenVerschieben && daten.zeilenVerschieben !== "ueberall") {
				pre.setAttribute("data-zeilen-verschieben", daten.zeilenVerschieben);
			}
		}
		if (daten.lueckenEingabe && daten.lueckenEingabe !== "tippen") {
			pre.setAttribute("data-luecken-eingabe", daten.lueckenEingabe);
		}
		if (daten.loesung && daten.loesung !== "nie") {
			pre.setAttribute("data-loesung", daten.loesung);
		}
		var code = element("code", daten.sprache ? "language-" + daten.sprache : "");
		code.textContent = daten.code;
		pre.appendChild(code);
		return pre;
	}

	function zeige(ziel, daten) {
		ziel.textContent = "";

		if (daten.titel.trim()) {
			ziel.appendChild(element("h3", "aufgabe", daten.titel.trim()));
		}
		if (daten.aufgabe.trim()) {
			var stellung = element("div", "aufgabenstellung");
			stellung.appendChild(formatiereText(daten.aufgabe));
			ziel.appendChild(stellung);
		}

		var pre = codehilfeElement(daten);
		ziel.appendChild(pre);

		/* Reihenfolge wie beim Laden einer Seite: zuerst Prism (Toolbar mit
		 * Copy-Knopf), dann die CodeHilfe. */
		if (window.Prism) {
			Prism.highlightElement(pre.querySelector("code"));
		}
		if (window.CodeHilfe) {
			CodeHilfe.starte();
		}
	}

	/* true, wenn die CodeHilfe statt der Aufgabe Konfigurationsfehler zeigt */
	function hatFehler(ziel) {
		return !!ziel.querySelector(".ch-konfigfehler");
	}

	window.CodeHilfeAufgabe = {
		zeige: zeige,
		hatFehler: hatFehler,
		formatiereText: formatiereText
	};
})();
