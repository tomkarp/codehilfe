/* ============================================================
 * CodeHilfe – interaktive Code-Aufgaben (Lücken füllen,
 * Zeilen sortieren oder beides kombiniert), sprachunabhängig.
 *
 * Einbindung als Feature in den Metadaten einer Seite:
 *
 *   Features: codehilfe
 *
 * Verwendung in einer Inhaltsdatei (der Quelltextblock wird beim
 * Laden durch das Widget ersetzt):
 *
 *   <pre class="quelltext codehilfe" data-zeilen-sortieren><code class="language-kotlin">
 *   fun main() {                §§fest
 *       val zahl = §§17§§
 *   }
 *   </code></pre>
 *
 * Die Prism-Sprache wird über language-* am code-Element angegeben.
 * Attribute am pre-Element:
 *   data-zeilen-sortieren   Zeilen werden gemischt
 *   data-zeilen-verschieben "ueberall" (Standard) oder "abschnitt"
 *   data-loesung            "nie" (Standard), "nach-fehler" oder "immer"
 *   data-luecken-eingabe    "tippen" (Standard) oder "baustein"
 *
 * Syntax im Quelltext (innerhalb des code-Elements):
 *   §§antwort§§              Lücke, die ausgefüllt werden muss
 *   §§antwort§andere§§       Lücke mit mehreren richtigen Antworten
 *   §§antwort::baustein§§    für diese Lücke einen Baustein verwenden
 *   §§antwort::tippen§§      diese Lücke eintippen
 *   §§antwort::extra§§        allein in einer Zeile: zusätzlicher Baustein,
 *                          der nicht benötigt wird
 *   §§fest am Zeilenende     feste Zeile
 *   §§gruppe am Zeilenende   direkt aufeinanderfolgende so markierte
 *                          Zeilen dürfen untereinander vertauscht werden
 *   §§gruppe=name           benannte austauschbare Gruppe; gleich
 *                          benannte Zeilen dürfen überall im Widget
 *                          verteilt stehen, auch über feste Zeilen hinweg
 *   §§extra am Zeilenende    überflüssige Zeile, gehört nicht zur
 *                          Lösung und muss in die Ablage sortiert werden
 *
 * Eine ausführliche Dokumentation mit Beispielen steht unter
 * 17_infschule/6_dokumentation/3_kapitel-erstellen/
 * 4_interaktive-elemente/42_codehilfe.
 * ============================================================ */
(function () {
	"use strict";

	/* Wird das Skript auf einer Seite mehrfach eingebunden, baut nur der
	 * erste Aufruf auf. */
	if (window.CodeHilfe) {
		return;
	}

	var LUECKE_RE = /§§([\s\S]*?)§§/g;

	/* ---------- Hilfsfunktionen ---------- */

	/* Für den Antwortvergleich in Lücken: Leerzeichen um Operatoren
	 * und Satzzeichen sind egal ("stand+betrag" == "stand + betrag"),
	 * zwischen Wörtern zählt genau ein Leerzeichen ("val x" != "valx"). */
	function normalisiere(text) {
		return text
			.replace(/\s+/g, " ")
			.trim()
			.replace(/ ?([^A-Za-z0-9_À-ɏ ]) ?/g, "$1");
	}

	function mische(liste) {
		for (var i = liste.length - 1; i > 0; i--) {
			var j = Math.floor(Math.random() * (i + 1));
			var tmp = liste[i];
			liste[i] = liste[j];
			liste[j] = tmp;
		}
		return liste;
	}

	/* Zwei bewegliche Zeilen aus unterschiedlichen Sortierlisten tauschen,
	 * ohne die Zahl der Zeilen in einem Abschnitt zu verändern. */
	function tauscheElemente(erstes, zweites) {
		var ersterElternteil = erstes.parentNode;
		var zweiterElternteil = zweites.parentNode;
		var marker = document.createComment("codehilfe-tausch");
		ersterElternteil.replaceChild(marker, erstes);
		zweiterElternteil.replaceChild(erstes, zweites);
		ersterElternteil.replaceChild(zweites, marker);
	}

	function highlightHTML(code, sprache) {
		if (window.Prism && Prism.languages[sprache]) {
			return Prism.highlight(code, Prism.languages[sprache], sprache);
		}
		var span = document.createElement("span");
		span.textContent = code;
		return span.innerHTML;
	}

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

	/* Das Symbol liegt im vorhandenen linken Innenabstand und verändert daher
	 * nicht die Einrückung des Quelltexts. */
	function bewerteBlock(block, richtig) {
		var status = block.querySelector(".ch-status");
		block.classList.remove("ch-richtig", "ch-falsch");
		block.classList.add(richtig ? "ch-richtig" : "ch-falsch");
		if (!status) {
			return;
		}
		status.hidden = false;
		status.textContent = richtig ? "✓" : "✕";
		status.classList.toggle("ch-status-richtig", richtig);
		status.classList.toggle("ch-status-falsch", !richtig);
		status.setAttribute("aria-label", richtig
			? "Zeile richtig eingeordnet"
			: "Zeile falsch eingeordnet");
	}

	function entferneBlockBewertung(block) {
		var status = block.querySelector(".ch-status");
		block.classList.remove("ch-richtig", "ch-falsch");
		if (status) {
			status.hidden = true;
			status.textContent = "";
			status.classList.remove("ch-status-richtig", "ch-status-falsch");
			status.removeAttribute("aria-label");
		}
	}

	/* ---------- Quelltext parsen ---------- */

	function parseLuecke(inhalt) {
		var darstellung = null;
		var modus = inhalt.match(/::(baustein|tippen)\s*$/);
		if (modus) {
			darstellung = modus[1];
			inhalt = inhalt.slice(0, modus.index);
		}
		return {
			darstellung: darstellung,
			antworten: inhalt.split("§").map(function (antwort) {
				return antwort.trim();
			})
		};
	}

	/* Eine Zeile besteht aus Teilen: { typ: "code", text: ... }
	 * oder { typ: "luecke", antworten: [...], darstellung: ... }. */
	function parseZeile(roh) {
		var zeile = roh.replace(/\s+$/, "");
		var extraBaustein = zeile.trim().match(
			/^§§([\s\S]*?)::extra§§$/);
		if (extraBaustein) {
			return {
				teile: [],
				schluessel: "",
				fest: false,
				austauschbar: false,
				austauschGruppe: "",
				ueberfluessig: false,
				extraBaustein: extraBaustein[1].trim(),
				leer: true
			};
		}
		var fest = false;
		var austauschbar = false;
		var austauschGruppe = "";
		var ueberfluessig = false;
		var endMarker = zeile.match(
			/[ \t]+§§(fest|extra|gruppe(?:=([A-Za-z0-9_-]+))?)$/);

		if (endMarker) {
			fest = endMarker[1] === "fest";
			austauschbar = endMarker[1].indexOf("gruppe") === 0;
			austauschGruppe = austauschbar ? (endMarker[2] || "") : "";
			ueberfluessig = endMarker[1] === "extra";
			/* Der gesamte Auffüllabstand vor dem Marker gehört nicht
			 * zum Code und wird zusammen mit dem Marker entfernt. */
			zeile = zeile.slice(0, endMarker.index).replace(/[ \t]+$/, "");
		}

		var teile = [];
		var pos = 0;
		var treffer;
		LUECKE_RE.lastIndex = 0;
		while ((treffer = LUECKE_RE.exec(zeile)) !== null) {
			if (treffer.index > pos) {
				teile.push({ typ: "code", text: zeile.slice(pos, treffer.index) });
			}
			var luecke = parseLuecke(treffer[1]);
			teile.push({
				typ: "luecke",
				antworten: luecke.antworten,
				darstellung: luecke.darstellung
			});
			pos = treffer.index + treffer[0].length;
		}
		if (pos < zeile.length) {
			teile.push({ typ: "code", text: zeile.slice(pos) });
		}

		/* Schlüssel: die Zeile mit eingesetzter Musterlösung –
		 * dient beim Sortieren zum Vergleich der Reihenfolge. */
		var schluessel = teile.map(function (teil) {
			return teil.typ === "code" ? teil.text : teil.antworten[0];
		}).join("");

		return {
			teile: teile,
			schluessel: schluessel,
			fest: fest,
			austauschbar: austauschbar,
			austauschGruppe: austauschGruppe,
			ueberfluessig: ueberfluessig,
			extraBaustein: null,
			leer: zeile.trim() === ""
		};
	}

	/* Direkt aufeinanderfolgende unbenannte §§gruppe-Zeilen bilden lokale
	 * Gruppen. Benannte Gruppen werden später widgetweit verbunden. */
	function bildeLoesungsGruppen(bloecke) {
		var gruppen = [];
		var lokaleGruppe = null;
		var benannteGruppen = Object.create(null);
		var position = 0;

		bloecke.forEach(function (block) {
			if (block.ueberfluessig) {
				lokaleGruppe = null;
				return;
			}
			if (block.austauschbar && block.austauschGruppe) {
				lokaleGruppe = null;
				if (!benannteGruppen[block.austauschGruppe]) {
					benannteGruppen[block.austauschGruppe] = {
						name: block.austauschGruppe,
						bloecke: [],
						positionen: []
					};
					gruppen.push(benannteGruppen[block.austauschGruppe]);
				}
				benannteGruppen[block.austauschGruppe].bloecke.push(block);
				benannteGruppen[block.austauschGruppe].positionen.push(position);
			} else if (block.austauschbar) {
				if (!lokaleGruppe) {
					lokaleGruppe = { bloecke: [], positionen: [] };
					gruppen.push(lokaleGruppe);
				}
				lokaleGruppe.bloecke.push(block);
				lokaleGruppe.positionen.push(position);
			} else {
				lokaleGruppe = null;
				gruppen.push({ bloecke: [block], positionen: [position] });
			}
			position++;
		});

		return gruppen;
	}

	/* Benannte Gruppen aus den einzelnen, durch §§fest getrennten Listen
	 * zu widgetweiten Gruppen verbinden. */
	function registriereLoesungsGruppen(liste, gruppen, benannteGruppen) {
		var lokaleGruppen = [];
		gruppen.forEach(function (gruppe) {
			if (!gruppe.name) {
				lokaleGruppen.push(gruppe);
				return;
			}
			if (!benannteGruppen[gruppe.name]) {
				benannteGruppen[gruppe.name] = {
					bloecke: [],
					stellen: []
				};
			}
			gruppe.bloecke.forEach(function (block, i) {
				benannteGruppen[gruppe.name].bloecke.push(block);
				benannteGruppen[gruppe.name].stellen.push({
					liste: liste,
					position: gruppe.positionen[i]
				});
			});
		});
		return lokaleGruppen;
	}

	function gleicheSchluessel(folge, gruppe) {
		if (folge.length !== gruppe.length) {
			return false;
		}
		var ist = folge.map(function (block) {
			return block.schluessel;
		}).sort();
		var soll = gruppe.map(function (block) {
			return block.schluessel;
		}).sort();
		return ist.every(function (schluessel, i) {
			return schluessel === soll[i];
		});
	}

	function bewerteGruppenZeilen(zeilen, gruppe) {
		/* Identische Zeilen bleiben unabhängig von ihrem Ursprungsblock
		 * austauschbar. Jede Sollzeile darf aber nur einmal zählen. */
		var verbleibend = Object.create(null);
		gruppe.forEach(function (block) {
			var schluessel = block.schluessel;
			verbleibend[schluessel] = (verbleibend[schluessel] || 0) + 1;
		});
		zeilen.forEach(function (li) {
			var schluessel = li._block.schluessel;
			var richtig = verbleibend[schluessel] > 0;
			if (richtig) {
				verbleibend[schluessel]--;
			}
			bewerteBlock(li, richtig);
		});
	}

	function reihenfolgePasst(bloecke, gruppen) {
		var erwartet = gruppen.reduce(function (summe, gruppe) {
			return summe + gruppe.bloecke.length;
		}, 0);
		if (bloecke.length !== erwartet) {
			return false;
		}
		return gruppen.every(function (gruppe) {
			var anPositionen = gruppe.positionen.map(function (position) {
				return bloecke[position];
			}).filter(function (block) {
				return block !== undefined;
			});
			return gleicheSchluessel(anPositionen, gruppe.bloecke);
		});
	}

	function parseQuelle(text) {
		var zeilen = text.replace(/\r\n?/g, "\n").split("\n");
		while (zeilen.length && zeilen[0].trim() === "") {
			zeilen.shift();
		}
		while (zeilen.length && zeilen[zeilen.length - 1].trim() === "") {
			zeilen.pop();
		}

		/* Erst die Zeilenmarkierungen entfernen, dann den gemeinsamen
		 * Einzug bestimmen und abschneiden. */
		var geparst = zeilen.map(parseZeile);

		var einzug = null;
		geparst.forEach(function (block) {
			if (block.leer) {
				return;
			}
			var erster = block.teile.length ? block.teile[0] : null;
			var fuehrend = (erster && erster.typ === "code")
				? erster.text.match(/^[ \t]*/)[0].length
				: 0;
			if (einzug === null || fuehrend < einzug) {
				einzug = fuehrend;
			}
		});
		if (einzug) {
			geparst.forEach(function (block) {
				var erster = block.teile.length ? block.teile[0] : null;
				if (erster && erster.typ === "code") {
					erster.text = erster.text.slice(einzug);
				}
				block.schluessel = block.schluessel.slice(einzug);
			});
		}

		return geparst;
	}

	/* ---------- Konfiguration für Autoren prüfen ---------- */

	function validiereKonfiguration(quellElement, text) {
		var fehler = [];
		var zeilenSortieren = quellElement.hasAttribute("data-zeilen-sortieren");
		var zeilenVerschiebenAttribut =
			quellElement.getAttribute("data-zeilen-verschieben");
		var lueckenEingabeAttribut =
			quellElement.getAttribute("data-luecken-eingabe");
		var loesungAttribut = quellElement.getAttribute("data-loesung");
		var zeilenVerschieben = zeilenVerschiebenAttribut === null
			? "ueberall"
			: zeilenVerschiebenAttribut;
		var lueckenEingabe = lueckenEingabeAttribut === null
			? "tippen"
			: lueckenEingabeAttribut;
		var loesung = loesungAttribut === null ? "nie" : loesungAttribut;
		var erlaubteAttribute = [
			"data-zeilen-sortieren",
			"data-zeilen-verschieben",
			"data-loesung",
			"data-luecken-eingabe"
		];

		Array.prototype.forEach.call(quellElement.attributes, function (attribut) {
			if (attribut.name.indexOf("data-") === 0 &&
				erlaubteAttribute.indexOf(attribut.name) === -1) {
				fehler.push("Unbekanntes Attribut " + attribut.name + ".");
			}
		});

		if (text.trim() === "") {
			fehler.push("Das code-Element enthält keinen Quelltext.");
		}

		if (quellElement.hasAttribute("data-zeilen-sortieren") &&
			quellElement.getAttribute("data-zeilen-sortieren") !== "") {
			fehler.push("data-zeilen-sortieren ist ein Schalter und erhält " +
				"keinen Wert.");
		}
		if (["ueberall", "abschnitt"].indexOf(zeilenVerschieben) === -1) {
			fehler.push("data-zeilen-verschieben kennt nur die Werte " +
				"ueberall und abschnitt.");
		}
		if (quellElement.hasAttribute("data-zeilen-verschieben") &&
			!zeilenSortieren) {
			fehler.push("data-zeilen-verschieben ist nur zusammen mit " +
				"data-zeilen-sortieren sinnvoll.");
		}
		if (["tippen", "baustein"].indexOf(lueckenEingabe) === -1) {
			fehler.push("data-luecken-eingabe kennt nur die Werte tippen " +
				"und baustein.");
		}
		if (["nie", "nach-fehler", "immer"].indexOf(loesung) === -1) {
			fehler.push("data-loesung kennt nur die Werte nie, nach-fehler " +
				"und immer.");
		}

		var zeilen = text.replace(/\r\n?/g, "\n").split("\n");
		while (zeilen.length && zeilen[0].trim() === "") {
			zeilen.shift();
		}
		while (zeilen.length && zeilen[zeilen.length - 1].trim() === "") {
			zeilen.pop();
		}

		var benannteGruppen = Object.create(null);
		var lokaleGruppe = [];

		function beendeLokaleGruppe() {
			if (lokaleGruppe.length === 1) {
				fehler.push("Zeile " + lokaleGruppe[0] +
					": Eine unbenannte Gruppe benötigt mindestens zwei " +
					"direkt aufeinanderfolgende Zeilen.");
			}
			lokaleGruppe = [];
		}

		zeilen.forEach(function (zeile, index) {
			var zeilennummer = index + 1;
			var ohneEndraum = zeile.replace(/\s+$/, "");
			var marker = ohneEndraum.match(
				/[ \t]+§§(fest|extra|gruppe(?:=([A-Za-z0-9_-]+))?)$/);
			var code = ohneEndraum;

			if (marker) {
				code = code.slice(0, marker.index).replace(/[ \t]+$/, "");
				if (!zeilenSortieren) {
					fehler.push("Zeile " + zeilennummer + ": Die Markierung §§" +
						marker[1] + " benötigt data-zeilen-sortieren.");
				}
				if (marker[1] === "gruppe") {
					lokaleGruppe.push(zeilennummer);
				} else {
					beendeLokaleGruppe();
					if (marker[2]) {
						if (!benannteGruppen[marker[2]]) {
							benannteGruppen[marker[2]] = [];
						}
						benannteGruppen[marker[2]].push(zeilennummer);
					}
				}
			} else {
				beendeLokaleGruppe();
			}

			var extraBaustein = code.trim().match(
				/^§§([\s\S]*?)::extra§§$/);
			if (extraBaustein) {
				if (extraBaustein[1].trim() === "") {
					fehler.push("Zeile " + zeilennummer +
						": Ein Extra-Baustein darf nicht leer sein.");
				}
				return;
			}
			if (/::extra\s*§§/.test(code)) {
				fehler.push("Zeile " + zeilennummer +
					": §§antwort::extra§§ muss allein in einer Zeile stehen.");
				return;
			}

			var lueckenRe = /§§([\s\S]*?)§§/g;
			var treffer;
			while ((treffer = lueckenRe.exec(code)) !== null) {
				var unbekannteOption =
					treffer[1].match(/::([A-Za-z][A-Za-z0-9_-]*)\s*$/);
				if (unbekannteOption &&
					["tippen", "baustein"].indexOf(unbekannteOption[1]) === -1) {
					fehler.push("Zeile " + zeilennummer +
						": Unbekannte Lückenoption ::" + unbekannteOption[1] +
						". Erlaubt sind ::tippen und ::baustein.");
				}
				var luecke = parseLuecke(treffer[1]);
				if (!luecke.antworten.length ||
					luecke.antworten.some(function (antwort) {
						return antwort === "";
					})) {
					fehler.push("Zeile " + zeilennummer +
						": Eine Lücke enthält eine leere Antwort.");
				}
				var eingabe = luecke.darstellung || lueckenEingabe;
				if (eingabe === "baustein" && luecke.antworten.length > 1) {
					fehler.push("Zeile " + zeilennummer +
						": Alternativlösungen sind bei Bausteinen nicht " +
						"vorgesehen.");
				}
			}

			lueckenRe.lastIndex = 0;
			var rest = code.replace(lueckenRe, "");
			var unbekannterMarker = rest.match(/[ \t]+§§(\S+)\s*$/);
			if (unbekannterMarker) {
				fehler.push("Zeile " + zeilennummer +
					": Unbekannte Zeilenmarkierung oder nicht geschlossene " +
					"Lücke §§" + unbekannterMarker[1] + ".");
			} else if (rest.indexOf("§§") !== -1) {
				fehler.push("Zeile " + zeilennummer +
					": Eine Lückenmarkierung ist nicht geschlossen.");
			}
		});
		beendeLokaleGruppe();

		Object.keys(benannteGruppen).forEach(function (name) {
			if (benannteGruppen[name].length === 1) {
				fehler.push("Zeile " + benannteGruppen[name][0] +
					": Die Gruppe " + name + " benötigt mindestens zwei Zeilen.");
			}
		});

		return fehler;
	}

	function zeigeKonfigurationsfehler(quellElement, fehler) {
		var box = element("div", "codehilfe ch-codehilfe ch-konfigfehler");
		box.appendChild(element(
			"strong", "ch-konfigfehler-titel",
			"CodeHilfe kann nicht angezeigt werden"
		));
		var liste = element("ul", "ch-konfigfehler-liste");
		fehler.forEach(function (meldung) {
			liste.appendChild(element("li", "", meldung));
		});
		box.appendChild(liste);
		quellElement.parentNode.replaceChild(box, quellElement);
		if (window.console) {
			console.error("CodeHilfe-Konfiguration:", fehler);
		}
	}

	/* ---------- Widget ---------- */

	function CodeHilfe(quellElement) {
		var codeElement = quellElement.querySelector("code");
		if (!codeElement) {
			zeigeKonfigurationsfehler(quellElement, [
				"Im pre-Element fehlt ein inneres code-Element."
			]);
			return;
		}

		/* Ohne language-* wird der Code ohne Syntaxhervorhebung angezeigt. */
		this.sprache = "";
		Array.prototype.some.call(codeElement.classList, function (klasse) {
			if (klasse.indexOf("language-") === 0) {
				this.sprache = klasse.slice("language-".length);
				return true;
			}
			return false;
		}, this);

		this.quelltext = codeElement.textContent;
		var konfigurationsfehler =
			validiereKonfiguration(quellElement, this.quelltext);
		if (konfigurationsfehler.length) {
			zeigeKonfigurationsfehler(quellElement, konfigurationsfehler);
			return;
		}

		this.zeilenSortieren =
			quellElement.hasAttribute("data-zeilen-sortieren");
		this.verschiebeModus =
			quellElement.getAttribute("data-zeilen-verschieben") || "ueberall";
		this.loesungsModus = quellElement.getAttribute("data-loesung") || "nie";
		this.lueckenModus =
			quellElement.getAttribute("data-luecken-eingabe") || "tippen";
		this.bloecke = parseQuelle(this.quelltext);
		this.kopierQuelle = codeElement;

		this.container = element("div", "codehilfe ch-codehilfe");

		/* Prism legt um normale Quelltextblöcke einen Rahmen mit Toolbar.
		 * Nur das pre-Element ersetzen, damit dessen Copy-Knopf erhalten bleibt. */
		quellElement.parentNode.replaceChild(this.container, quellElement);
		this.baueAuf();
	}

	CodeHilfe.prototype.baueAuf = function () {
		var alteWurzel = this.container.querySelector(".ch-widget");
		if (alteWurzel) {
			alteWurzel.remove();
		}

		var alleBloecke = parseQuelle(this.quelltext);
		this.extraBausteine = alleBloecke.filter(function (block) {
			return block.extraBaustein !== null;
		}).map(function (block) {
			return block.extraBaustein;
		});
		var bloecke = alleBloecke.filter(function (block) {
			return block.extraBaustein === null;
		});
		this.bloecke = bloecke;
		this.loesungSichtbar = false;
		this.ziehLuecken = [];
		this.ausgewaehlteKarte = null;
		this.wurzel = element("div", "ch-widget");

		if (this.zeilenSortieren) {
			this.baueSortieren(bloecke);
		} else {
			this.baueLuecken(bloecke);
		}

		this.baueZiehLuecken();
		this.baueAktionen();
		this.container.appendChild(this.wurzel);
		this.aktualisiereKopierQuelle();
	};

	/* Eine Codezeile als DOM-Element (Hervorhebung + Eingabefelder) */
	CodeHilfe.prototype.zeilenElement = function (block) {
		var self = this;
		var code = element("code", "ch-zeile");
		block.teile.forEach(function (teil) {
			if (teil.typ === "code") {
				var span = element("span");
				span.innerHTML = highlightHTML(teil.text, self.sprache);
				code.appendChild(span);
			} else {
				var darstellung = teil.darstellung || self.lueckenModus;
				var feld = element("span", "ch-lueckenfeld");
				feld._antworten = teil.antworten;
				feld._darstellung = darstellung;
				feld._karte = null;

				var eingabe = element("input", "ch-luecke");
				eingabe.type = "text";
				eingabe.spellcheck = false;
				eingabe.autocomplete = "off";
				eingabe.setAttribute("autocapitalize", "off");
				eingabe.setAttribute("autocorrect", "off");
				eingabe.setAttribute("aria-label", "Code-Lücke");
				eingabe._feld = feld;
				feld.appendChild(eingabe);
				code.appendChild(feld);

				if (darstellung === "baustein") {
					self.ziehLuecken.push({
						ziel: feld,
						antwort: teil.antworten[0]
					});
				}
			}
		});
		if (!block.teile.length) {
			code.appendChild(element("span", "", " "));
		}
		return code;
	};

	/* ----- Code mit Lücken in fester Zeilenreihenfolge ----- */

	CodeHilfe.prototype.baueLuecken = function (bloecke) {
		var self = this;
		var pre = element("pre", "ch-code");
		this.zeilen = [];

		bloecke.forEach(function (block) {
			if (block.ueberfluessig) {
				return;
			}
			var zeile = element("div", "ch-codezeile");
			zeile.appendChild(self.zeilenElement(block));
			zeile._block = block;
			pre.appendChild(zeile);
			self.zeilen.push(zeile);
		});

		this.wurzel.appendChild(pre);
	};

	/* ----- Lücken mit ziehbaren Codebausteinen ----- */

	CodeHilfe.prototype.baueZiehLuecken = function () {
		var eintraege = this.ziehLuecken.slice();
		this.extraBausteine.forEach(function (antwort) {
			eintraege.push({ ziel: null, antwort: antwort, extra: true });
		});
		if (!eintraege.length) {
			this.lueckenKarten = null;
			return;
		}

		var self = this;
		var auswahl = element("div", "ch-luecken-auswahl");
		auswahl.appendChild(element(
			"div", "ch-luecken-auswahl-titel",
			"Ziehe die Codebausteine in die passenden Lücken:"
		));
		this.lueckenKarten = element("div", "ch-luecken-karten");
		this.lueckenKarten.tabIndex = 0;
		this.lueckenKarten.setAttribute("role", "button");
		this.lueckenKarten.setAttribute(
			"aria-label", "Ablage für noch nicht eingesetzte Codebausteine");

		mische(eintraege).forEach(function (eintrag) {
			var karte = element("button", "ch-luecken-karte", eintrag.antwort);
			karte.type = "button";
			karte._wert = eintrag.antwort;
			karte.title = "Codebaustein ziehen oder auswählen";
			karte.setAttribute("aria-pressed", "false");
			self.lueckenKarten.appendChild(karte);
		});

		auswahl.appendChild(this.lueckenKarten);
		if (this.ablageListe) {
			this.wurzel.insertBefore(auswahl, this.ablageListe.parentNode);
		} else {
			this.wurzel.appendChild(auswahl);
		}
		this.aktiviereLueckenDrag();
	};

	CodeHilfe.prototype.waehleLueckenKarte = function (karte) {
		if (this.ausgewaehlteKarte) {
			this.ausgewaehlteKarte.classList.remove("ch-ausgewaehlt");
			this.ausgewaehlteKarte.setAttribute("aria-pressed", "false");
		}
		if (this.ausgewaehlteKarte === karte) {
			this.ausgewaehlteKarte = null;
			return;
		}
		this.ausgewaehlteKarte = karte;
		if (karte) {
			karte.classList.add("ch-ausgewaehlt");
			karte.setAttribute("aria-pressed", "true");
		}
	};

	CodeHilfe.prototype.setzeLueckenKarte = function (karte, ziel) {
		if (!karte) {
			return;
		}
		var ursprung = karte._lueckenZiel || null;
		if (ursprung === ziel) {
			this.waehleLueckenKarte(null);
			return;
		}

		var vorhandeneKarte = ziel ? ziel._karte : null;
		if (ursprung) {
			ursprung._karte = null;
			ursprung.classList.remove("ch-per-drag");
			var ursprungsEingabe = ursprung.querySelector(".ch-luecke");
			ursprungsEingabe.hidden = false;
			ursprungsEingabe.value = "";
		}

		if (vorhandeneKarte && vorhandeneKarte !== karte) {
			if (ursprung) {
				this.platziereLueckenKarte(vorhandeneKarte, ursprung);
			} else {
				this.platziereLueckenKarte(vorhandeneKarte, null);
			}
		}

		this.platziereLueckenKarte(karte, ziel);
		this.waehleLueckenKarte(null);
		this.entwerte();
	};

	CodeHilfe.prototype.platziereLueckenKarte = function (karte, ziel) {
		karte._lueckenZiel = ziel;
		if (!ziel) {
			karte.hidden = false;
			this.lueckenKarten.appendChild(karte);
			return;
		}

		ziel._karte = karte;
		var eingabe = ziel.querySelector(".ch-luecke");
		eingabe.value = karte._wert;
		eingabe.hidden = true;
		ziel.classList.remove("ch-getippt");
		ziel.classList.add("ch-per-drag");
		karte.hidden = false;
		ziel.appendChild(karte);
	};

	CodeHilfe.prototype.aktiviereLueckenDrag = function () {
		var self = this;

		this.wurzel.addEventListener("click", function (ereignis) {
			var karte = ereignis.target.closest(".ch-luecken-karte");
			if (karte && !karte._ziehenBeendet) {
				var belegtesZiel = karte.closest(".ch-lueckenfeld");
				if (belegtesZiel && self.ausgewaehlteKarte &&
					self.ausgewaehlteKarte !== karte) {
					self.setzeLueckenKarte(self.ausgewaehlteKarte, belegtesZiel);
				} else {
					self.waehleLueckenKarte(karte);
				}
				return;
			}
			var ziel = ereignis.target.closest(".ch-lueckenfeld");
			if (ziel && self.ausgewaehlteKarte) {
				self.setzeLueckenKarte(self.ausgewaehlteKarte, ziel);
				return;
			}
			if (ereignis.target.closest(".ch-luecken-karten") &&
				self.ausgewaehlteKarte) {
				self.setzeLueckenKarte(self.ausgewaehlteKarte, null);
			}
		});

		this.wurzel.addEventListener("keydown", function (ereignis) {
			if (ereignis.key !== "Enter" && ereignis.key !== " ") {
				return;
			}
			var ziel = ereignis.target.closest(".ch-lueckenfeld");
			if (ziel && self.ausgewaehlteKarte) {
				ereignis.preventDefault();
				self.setzeLueckenKarte(self.ausgewaehlteKarte, ziel);
				return;
			}
			if (ereignis.target.closest(".ch-luecken-karten") &&
				self.ausgewaehlteKarte) {
				ereignis.preventDefault();
				self.setzeLueckenKarte(self.ausgewaehlteKarte, null);
			}
		});

		this.wurzel.addEventListener("pointerdown", function (ereignis) {
			var karte = ereignis.target.closest(".ch-luecken-karte");
			if (!karte || ereignis.button !== 0) {
				return;
			}
			var zeigerId = ereignis.pointerId;
			var startX = ereignis.clientX;
			var startY = ereignis.clientY;
			var gezogen = false;
			var geist = null;
			try {
				karte.setPointerCapture(zeigerId);
			} catch (fehler) {
				/* Die document-Listener funktionieren auch ohne Pointer-Capture. */
			}

			function bewege(ev) {
				if (ev.pointerId !== zeigerId) {
					return;
				}
				if (!gezogen &&
					Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5) {
					return;
				}
				if (!gezogen) {
					gezogen = true;
					karte.classList.add("ch-luecken-karte-gezogen");
					geist = karte.cloneNode(true);
					geist.classList.remove(
						"ch-luecken-karte-gezogen", "ch-ausgewaehlt");
					geist.classList.add("ch-luecken-geist");
					document.body.appendChild(geist);
				}
				ev.preventDefault();
				geist.style.transform =
					"translate3d(" + ev.clientX + "px, " + ev.clientY +
					"px, 0) translate(-50%, -50%)";
			}

			function beende(ev) {
				if (ev.pointerId !== zeigerId) {
					return;
				}
				document.removeEventListener("pointermove", bewege);
				document.removeEventListener("pointerup", beende);
				document.removeEventListener("pointercancel", beende);
				if (!gezogen) {
					return;
				}
				var unterZeiger = document.elementFromPoint(ev.clientX, ev.clientY);
				var ziel = unterZeiger && unterZeiger.closest(
					".ch-lueckenfeld");
				var ablage = unterZeiger && unterZeiger.closest(".ch-luecken-karten");
				karte.classList.remove("ch-luecken-karte-gezogen");
				if (geist) {
					geist.remove();
				}
				karte._ziehenBeendet = true;
				setTimeout(function () {
					karte._ziehenBeendet = false;
				}, 0);
				if (ziel) {
					self.setzeLueckenKarte(karte, ziel);
				} else if (ablage) {
					self.setzeLueckenKarte(karte, null);
				}
			}

			document.addEventListener("pointermove", bewege);
			document.addEventListener("pointerup", beende);
			document.addEventListener("pointercancel", beende);
		});
	};

	/* ----- Sortierbare Zeilen ----- */

	CodeHilfe.prototype.baueSortieren = function (bloecke) {
		var self = this;

		var relevant = bloecke.filter(function (block) {
			return !block.leer;
		});
		this.mitAblage = relevant.some(function (block) {
			return block.ueberfluessig;
		});

		var bereich = element("div", "ch-sortierbereich");
		if (this.verschiebeModus === "ueberall") {
			bereich.classList.add("ch-verschieben-ueberall");
		}
		this.sortierListen = [];
		this.ausgabeTeile = [];
		this.benannteLoesungsGruppen = Object.create(null);

		/* Jede §§fest-Zeile bleibt an ihrer Position. Die beweglichen Zeilen
		 * zwischen zwei festen Bereichen bilden je eine eigene Sortierliste. */
		var abschnitt = [];
		var feste = [];

		function fuegeAbschnittEin() {
			if (!abschnitt.length) {
				return;
			}
			var original = abschnitt.slice();
			var loesungsGruppen = bildeLoesungsGruppen(original);
			var gemischt = mische(original.slice());
			var versuche = 0;
			while (versuche < 20 && gemischt.length > 1 &&
				reihenfolgePasst(gemischt, loesungsGruppen)) {
				gemischt = mische(original.slice());
				versuche++;
			}

			var liste = element("ul", "ch-liste");
			liste._loesung = original.filter(function (block) {
				return !block.ueberfluessig;
			});
			liste._loesungsGruppen = registriereLoesungsGruppen(
				liste, loesungsGruppen, self.benannteLoesungsGruppen);
			gemischt.forEach(function (block) {
				var li = self.blockElement(block);
				li._ursprungsListe = liste;
				liste.appendChild(li);
			});
			bereich.appendChild(liste);
			self.sortierListen.push(liste);
			self.ausgabeTeile.push(liste);
			abschnitt = [];
		}

		function fuegeFesteEin() {
			if (!feste.length) {
				return;
			}
			var fest = self.festerBereich(feste);
			bereich.appendChild(fest);
			self.ausgabeTeile.push(fest);
			feste = [];
		}

		relevant.forEach(function (block) {
			if (block.fest) {
				fuegeAbschnittEin();
				feste.push(block);
			} else {
				fuegeFesteEin();
				abschnitt.push(block);
			}
		});
		fuegeAbschnittEin();
		fuegeFesteEin();
		if (this.verschiebeModus === "ueberall") {
			this.mischeZeilenUeberall();
		}

		this.wurzel.appendChild(bereich);

		if (this.mitAblage) {
			var ablage = element("div", "ch-ablage");
			ablage.appendChild(element("div", "ch-ablage-titel",
				"Ablage – Zeilen, die nicht gebraucht werden:"));
			this.ablageListe = element("ul", "ch-liste ch-ablage-liste");
			ablage.appendChild(this.ablageListe);
			this.wurzel.appendChild(ablage);
		}

		this.aktiviereDrag();
	};

	/* Im Modus "ueberall" alle beweglichen Zeilen widgetweit mischen.
	 * Feste Zeilen und die Zahl der beweglichen Plätze zwischen ihnen bleiben
	 * erhalten. Im Modus "abschnitt" findet diese zweite Mischung nicht statt. */
	CodeHilfe.prototype.mischeZeilenUeberall = function () {
		var zeilen = [];
		var ziele = [];

		this.sortierListen.forEach(function (liste) {
			Array.prototype.forEach.call(
				Array.prototype.slice.call(liste.children),
				function (li) {
					var marker = document.createComment("codehilfe-platz");
					liste.replaceChild(marker, li);
					zeilen.push(li);
					ziele.push({ liste: liste, marker: marker });
				}
			);
		});

		var gemischt = mische(zeilen.slice());
		var versuche = 0;
		while (versuche < 20 && gemischt.length > 1 &&
			gemischt.every(function (li, index) {
				return li === zeilen[index];
			})) {
			gemischt = mische(zeilen.slice());
			versuche++;
		}

		ziele.forEach(function (ziel, index) {
			var li = gemischt[index];
			ziel.liste.replaceChild(li, ziel.marker);
			li._ursprungsListe = ziel.liste;
		});
	};

	CodeHilfe.prototype.festerBereich = function (bloecke) {
		var self = this;
		var pre = element("pre", "ch-code ch-fest");
		bloecke.forEach(function (block) {
			var zeile = element("div", "ch-codezeile");
			zeile.appendChild(self.zeilenElement(block));
			pre.appendChild(zeile);
		});
		return pre;
	};

	CodeHilfe.prototype.blockElement = function (block) {
		var self = this;
		var li = element("li", "ch-block");
		li._block = block;
		var status = element("span", "ch-status");
		status.hidden = true;
		status.setAttribute("role", "img");
		li.appendChild(status);

		li.appendChild(this.zeilenElement(block));

		var werkzeuge = element("span", "ch-werkzeuge");

		var griff = element("span", "ch-griff", "⠿");
		griff.title = "Ziehen, um die Zeile zu verschieben";

		var hoch = element("button", "ch-mini ch-hoch", "▲");
		hoch.type = "button";
		hoch.title = "Zeile nach oben";
		werkzeuge.appendChild(hoch);

		var runter = element("button", "ch-mini ch-runter", "▼");
		runter.type = "button";
		runter.title = "Zeile nach unten";
		werkzeuge.appendChild(runter);

		if (this.mitAblage) {
			var weg = element("button", "ch-mini ch-weg", "✕");
			weg.type = "button";
			weg.title = "Zeile in die Ablage verschieben / zurückholen";
			werkzeuge.appendChild(weg);
		}

		werkzeuge.appendChild(griff);

		li.appendChild(werkzeuge);

		werkzeuge.addEventListener("click", function (ereignis) {
			var knopf = ereignis.target.closest("button");
			if (!knopf) {
				return;
			}
			if (knopf.classList.contains("ch-hoch")) {
				if (li.previousElementSibling) {
					li.parentNode.insertBefore(li, li.previousElementSibling);
				} else if (self.verschiebeModus === "ueberall") {
					var indexOben = self.sortierListen.indexOf(li.parentNode);
					if (indexOben > 0) {
						var vorherigeZeile =
							self.sortierListen[indexOben - 1].lastElementChild;
						if (vorherigeZeile) {
							tauscheElemente(li, vorherigeZeile);
						}
					}
				}
			} else if (knopf.classList.contains("ch-runter")) {
				if (li.nextElementSibling) {
					li.parentNode.insertBefore(li.nextElementSibling, li);
				} else if (self.verschiebeModus === "ueberall") {
					var indexUnten = self.sortierListen.indexOf(li.parentNode);
					if (indexUnten >= 0 && indexUnten < self.sortierListen.length - 1) {
						var naechsteListe = self.sortierListen[indexUnten + 1];
						if (naechsteListe.firstElementChild) {
							tauscheElemente(li, naechsteListe.firstElementChild);
						}
					}
				}
			} else if (knopf.classList.contains("ch-weg")) {
				if (li.parentNode === self.ablageListe) {
					li._ursprungsListe.appendChild(li);
				} else {
					self.ablageListe.appendChild(li);
				}
			}
			self.entwerte();
		});

		return li;
	};

	/* Verschieben per Zeigergeste (Maus, Stift, Touch) */
	CodeHilfe.prototype.aktiviereDrag = function () {
		var self = this;

		this.wurzel.addEventListener("pointerdown", function (ereignis) {
			var griff = ereignis.target.closest(".ch-griff");
			if (!griff) {
				return;
			}
			var li = griff.closest(".ch-block");
			var liste = li.parentNode;
			var zeigerId = ereignis.pointerId;
			ereignis.preventDefault();
			li.classList.add("ch-gezogen");
			try {
				griff.setPointerCapture(zeigerId);
			} catch (fehler) {
				/* egal – die document-Listener übernehmen */
			}

			function sortierListeUnterZeiger(ev) {
				var unterZeiger = document.elementFromPoint(ev.clientX, ev.clientY);
				var ziel = unterZeiger && unterZeiger.closest(".ch-liste");
				return self.sortierListen.indexOf(ziel) >= 0 ? ziel : null;
			}

			function fuegeAnZeigerpositionEin(zielListe, ev) {
				var kinder = Array.prototype.slice.call(zielListe.children)
					.filter(function (kind) {
						return kind !== li;
					});
				var vor = null;
				for (var i = 0; i < kinder.length; i++) {
					var box = kinder[i].getBoundingClientRect();
					if (ev.clientY < box.top + box.height / 2) {
						vor = kinder[i];
						break;
					}
				}
				if (vor) {
					zielListe.insertBefore(li, vor);
				} else {
					zielListe.appendChild(li);
				}
				liste = zielListe;
			}

			function verschiebeAnZeigerposition(ev) {
				var unterZeiger = document.elementFromPoint(ev.clientX, ev.clientY);
				var ueberAblage = self.ablageListe &&
					unterZeiger && unterZeiger.closest(".ch-ablage");
				if (ueberAblage) {
					fuegeAnZeigerpositionEin(self.ablageListe, ev);
					return;
				}

				var zielListe = sortierListeUnterZeiger(ev);
				var gueltigesZiel = zielListe &&
					(self.verschiebeModus === "ueberall" ||
						zielListe === li._ursprungsListe);
				if (gueltigesZiel) {
					fuegeAnZeigerpositionEin(zielListe, ev);
					return;
				}

				/* Zwischen Ablage und Code bleibt die Zeile in der Ablage,
				 * bis tatsächlich ein zulässiger Sortierbereich erreicht ist. */
				if (liste === self.ablageListe) {
					return;
				}

				if (self.verschiebeModus === "ueberall") {
					var besteListe = liste;
					var kleinsterAbstand = Infinity;
					self.sortierListen.forEach(function (moeglicheListe) {
						var listenBox = moeglicheListe.getBoundingClientRect();
						var abstand = ev.clientY < listenBox.top
							? listenBox.top - ev.clientY
							: (ev.clientY > listenBox.bottom
								? ev.clientY - listenBox.bottom
								: 0);
						if (abstand < kleinsterAbstand) {
							kleinsterAbstand = abstand;
							besteListe = moeglicheListe;
						}
					});
					if (besteListe !== liste && besteListe.children.length) {
						var tauschPartner = besteListe.firstElementChild;
						var partnerAbstand = Infinity;
						Array.prototype.forEach.call(
							besteListe.children, function (moeglicherPartner) {
								var partnerBox = moeglicherPartner.getBoundingClientRect();
								var abstandZurMitte = Math.abs(
									ev.clientY - (partnerBox.top + partnerBox.height / 2));
								if (abstandZurMitte < partnerAbstand) {
									partnerAbstand = abstandZurMitte;
									tauschPartner = moeglicherPartner;
								}
							});
						tauscheElemente(li, tauschPartner);
						liste = besteListe;
					}
				}

				fuegeAnZeigerpositionEin(liste, ev);
			}

			function bewege(ev) {
				if (ev.pointerId !== zeigerId) {
					return;
				}
				verschiebeAnZeigerposition(ev);
			}

			function beende(ev) {
				if (ev.pointerId !== zeigerId) {
					return;
				}
				if (ev.type !== "pointercancel") {
					verschiebeAnZeigerposition(ev);
				}
				li.classList.remove("ch-gezogen");
				document.removeEventListener("pointermove", bewege);
				document.removeEventListener("pointerup", beende);
				document.removeEventListener("pointercancel", beende);
				self.entwerte();
			}

			document.addEventListener("pointermove", bewege);
			document.addEventListener("pointerup", beende);
			document.addEventListener("pointercancel", beende);
		});
	};

	/* ----- Aktionen und Prüfung ----- */

	CodeHilfe.prototype.baueAktionen = function () {
		var self = this;
		var aktionen = element("div", "ch-aktionen");

		this.pruefKnopf = element("button", "ch-pruefen", "Überprüfen");
		this.pruefKnopf.type = "button";
		aktionen.appendChild(this.pruefKnopf);

		this.resetKnopf = element("button", "ch-reset", "Zurücksetzen");
		this.resetKnopf.type = "button";
		aktionen.appendChild(this.resetKnopf);

		if (this.loesungsModus === "immer" || this.loesungsModus === "nach-fehler") {
			this.loesungsKnopf = element("button", "ch-loesung-knopf", "Lösung anzeigen");
			this.loesungsKnopf.type = "button";
			this.loesungsKnopf.setAttribute("aria-expanded", "false");
			if (this.loesungsModus === "nach-fehler") {
				this.loesungsKnopf.disabled = true;
				this.loesungsKnopf.title =
					"Die Lösung kann nach einer erfolglosen Überprüfung angezeigt werden.";
			}
			aktionen.appendChild(this.loesungsKnopf);
		} else {
			this.loesungsKnopf = null;
		}

		this.wurzel.appendChild(aktionen);

		this.meldung = element("p", "ch-meldung");
		this.meldung.setAttribute("aria-live", "polite");
		this.wurzel.appendChild(this.meldung);

		if (this.loesungsKnopf) {
			this.loesungsBereich = element("div", "ch-loesung");
			this.loesungsBereich.hidden = true;
			var titel = element("p", "ch-loesung-titel");
			titel.appendChild(element("strong", "", "Lösung"));
			this.loesungsBereich.appendChild(titel);
			var pre = element("pre", "ch-code");
			var code = element("code", "ch-zeile");
			code.innerHTML = highlightHTML(this.loesungsText(), this.sprache);
			pre.appendChild(code);
			this.loesungsBereich.appendChild(pre);
			this.wurzel.appendChild(this.loesungsBereich);
		}

		this.pruefKnopf.addEventListener("click", function () {
			self.pruefe();
		});
		this.resetKnopf.addEventListener("click", function () {
			self.baueAuf();
		});
		if (this.loesungsKnopf) {
			this.loesungsKnopf.addEventListener("click", function () {
				self.loesungSichtbar = !self.loesungSichtbar;
				self.loesungsBereich.hidden = !self.loesungSichtbar;
				self.loesungsKnopf.textContent = self.loesungSichtbar
					? "Lösung ausblenden"
					: "Lösung anzeigen";
				self.loesungsKnopf.setAttribute(
					"aria-expanded", self.loesungSichtbar ? "true" : "false");
			});
		}
		this.wurzel.addEventListener("input", function (ereignis) {
			if (ereignis.target.classList.contains("ch-luecke")) {
				var feld = ereignis.target._feld;
				feld.classList.toggle("ch-getippt", ereignis.target.value !== "");
				ereignis.target.removeAttribute("aria-invalid");
				self.entwerte();
			}
		});
		this.wurzel.addEventListener("keydown", function (ereignis) {
			if (ereignis.defaultPrevented) {
				return;
			}
			if (ereignis.key === "Enter" && ereignis.target.classList.contains("ch-luecke")) {
				ereignis.preventDefault();
				self.pruefe();
			}
		});
	};

	/* Rückmeldungen entfernen, sobald sich etwas ändert */
	CodeHilfe.prototype.entwerte = function () {
		this.meldung.textContent = "";
		this.meldung.classList.remove("ch-erfolg", "ch-misserfolg");
		Array.prototype.forEach.call(
			this.wurzel.querySelectorAll(".ch-block, .ch-codezeile"),
			function (el) {
				entferneBlockBewertung(el);
			}
		);
		Array.prototype.forEach.call(
			this.wurzel.querySelectorAll(".ch-lueckenfeld"),
			function (feld) {
				feld.classList.remove("ch-ok", "ch-fehler");
				feld.removeAttribute("aria-invalid");
				feld.querySelector(".ch-luecke").removeAttribute("aria-invalid");
			}
		);
		this.aktualisiereKopierQuelle();
	};

	CodeHilfe.prototype.pruefe = function () {
		var allesRichtig = true;
		var falscheEingabeart = false;

		/* Lücken prüfen (nicht in der Ablage) */
		var luecken = this.wurzel.querySelectorAll(".ch-lueckenfeld");
		Array.prototype.forEach.call(luecken, function (feld) {
			if (feld.closest(".ch-ablage")) {
				feld.classList.remove("ch-ok", "ch-fehler");
				feld.removeAttribute("aria-invalid");
				return;
			}
			var eingabe = feld.querySelector(".ch-luecke");
			var karte = feld._karte;
			var verwendeteDarstellung = karte
				? "baustein"
				: (eingabe.value.trim() !== "" ? "tippen" : "");
			/* Eine richtige Eingabe per Tastatur ist immer zulässig. Nur ein
			 * Baustein in einer ausdrücklich zu tippenden Lücke ist falsch. */
			var falscheDarstellung = verwendeteDarstellung === "baustein" &&
				feld._darstellung === "tippen";
			if (falscheDarstellung) {
				falscheEingabeart = true;
			}
			var wert = normalisiere(karte ? karte._wert : eingabe.value);
			var richtig = !falscheDarstellung &&
				verwendeteDarstellung !== "" &&
				feld._antworten.some(function (antwort) {
					return normalisiere(antwort) === wert;
				});
			feld.classList.remove("ch-ok", "ch-fehler");
			feld.classList.add(richtig ? "ch-ok" : "ch-fehler");
			if (richtig) {
				feld.removeAttribute("aria-invalid");
				eingabe.removeAttribute("aria-invalid");
			} else {
				feld.setAttribute("aria-invalid", "true");
				eingabe.setAttribute("aria-invalid", "true");
			}
			if (!richtig) {
				allesRichtig = false;
			}
		});

		/* Reihenfolge prüfen */
		if (this.zeilenSortieren) {
			this.sortierListen.forEach(function (liste) {
				var loesung = liste._loesung;
				var zeilen = Array.prototype.slice.call(liste.children);
				if (zeilen.length !== loesung.length) {
					allesRichtig = false;
				}
				liste._loesungsGruppen.forEach(function (gruppe) {
					var aktuelleZeilen = gruppe.positionen.map(function (position) {
						return zeilen[position];
					}).filter(function (li) {
						return li !== undefined;
					});
					var passt = gleicheSchluessel(aktuelleZeilen.map(function (li) {
						return li._block;
					}), gruppe.bloecke);
					bewerteGruppenZeilen(aktuelleZeilen, gruppe.bloecke);
					if (!passt) {
						allesRichtig = false;
					}
				});
				zeilen.slice(loesung.length).forEach(function (li) {
					bewerteBlock(li, false);
					allesRichtig = false;
				});
			});
			Object.keys(this.benannteLoesungsGruppen).forEach(function (name) {
				var gruppe = this.benannteLoesungsGruppen[name];
				var aktuelleZeilen = gruppe.stellen.map(function (stelle) {
					return stelle.liste.children[stelle.position];
				}).filter(function (li) {
					return li !== undefined;
				});
				var passt = gleicheSchluessel(aktuelleZeilen.map(function (li) {
					return li._block;
				}), gruppe.bloecke);
				bewerteGruppenZeilen(aktuelleZeilen, gruppe.bloecke);
				if (!passt) {
					allesRichtig = false;
				}
			}, this);
			if (this.ablageListe) {
				Array.prototype.forEach.call(this.ablageListe.children, function (li) {
					bewerteBlock(li, li._block.ueberfluessig);
					if (!li._block.ueberfluessig) {
						allesRichtig = false;
					}
				});
			}
		}

		this.meldung.classList.remove("ch-erfolg", "ch-misserfolg");
		if (allesRichtig) {
			this.meldung.classList.add("ch-erfolg");
			this.meldung.textContent = "Alles richtig!";
		} else {
			this.meldung.classList.add("ch-misserfolg");
			this.meldung.textContent = falscheEingabeart
				? "Noch nicht alles richtig – bei einigen markierten Lücken " +
					"passt die Art des Füllens noch nicht."
				: "Noch nicht alles richtig – schau dir die markierten Stellen an.";
			if (this.loesungsKnopf && this.loesungsModus === "nach-fehler") {
				this.loesungsKnopf.disabled = false;
				this.loesungsKnopf.removeAttribute("title");
			}
		}
	};

	CodeHilfe.prototype.loesungsText = function () {
		return this.bloecke.filter(function (block) {
			return !block.ueberfluessig;
		}).map(function (block) {
			return block.schluessel;
		}).join("\n") + "\n";
	};

	/* Der normale Copy-Knopf von Prism liest weiterhin aus dem ursprünglichen
	 * code-Element. Dessen Inhalt folgt dem aktuellen Bearbeitungsstand, enthält
	 * aber keine CodeHilfe-Markierungen. §§extra-Zeilen werden mitkopiert, solange
	 * sie noch im Codebereich liegen. */
	CodeHilfe.prototype.aktualisiereKopierQuelle = function () {
		function zeilenText(wurzelElement) {
			if (wurzelElement._block && wurzelElement._block.leer) {
				return "";
			}
			var code = wurzelElement.querySelector(".ch-zeile");
			var text = "";
			Array.prototype.forEach.call(code.childNodes, function (kind) {
				if (kind.classList &&
					kind.classList.contains("ch-lueckenfeld")) {
					text += kind.querySelector(".ch-luecke").value;
				} else {
					text += kind.textContent;
				}
			});
			return text.replace(/\s+$/, "");
		}

		var zeilen = [];
		function sammle(behaelter) {
			Array.prototype.forEach.call(behaelter.children, function (element) {
				zeilen.push(zeilenText(element));
			});
		}

		if (this.zeilenSortieren) {
			this.ausgabeTeile.forEach(sammle);
		} else {
			this.zeilen.forEach(function (zeile) {
				zeilen.push(zeilenText(zeile));
			});
		}
		this.kopierQuelle.textContent = zeilen.join("\n") + "\n";
	};

	/* ---------- Start ---------- */

	/* Ersetzt alle noch nicht aufgebauten CodeHilfen. Bereits ersetzte
	 * pre-Elemente sind nicht mehr im Dokument; ein erneuter Aufruf ist
	 * daher unschädlich. */
	function starte() {
		Array.prototype.forEach.call(
			document.querySelectorAll("pre.codehilfe"),
			function (quellElement) {
				try {
					new CodeHilfe(quellElement);
				} catch (fehler) {
					if (window.console) {
						console.error("CodeHilfe:", fehler);
					}
				}
			}
		);
	}

	/* Prism baut an DOMContentLoaded die Toolbar mit Copy-Knopf. Die
	 * CodeHilfe muss danach starten. Als Feature (Modul) läuft dieses Skript
	 * bereits mit readyState "interactive", aber noch vor DOMContentLoaded;
	 * dynamisch nachgeladen liefe es erst danach. Die Navigation-Timing-Angabe
	 * unterscheidet beide Fälle. */
	function domContentLoadedVorbei() {
		if (document.readyState === "loading") {
			return false;
		}
		if (document.readyState === "complete") {
			return true;
		}
		var navigation = window.performance && performance.getEntriesByType
			? performance.getEntriesByType("navigation")[0]
			: null;
		return navigation ? navigation.domContentLoadedEventStart > 0 : true;
	}

	window.CodeHilfe = { starte: starte };

	if (domContentLoadedVorbei()) {
		starte();
	} else {
		document.addEventListener("DOMContentLoaded", starte);
	}
})();
