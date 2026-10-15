/* ============================================================
 * Editor – CodeHilfe-Aufgaben erstellen, Vorschau, Teilen.
 *
 * Der Entwurf wird nur im eigenen Browser zwischengespeichert
 * (localStorage). Geteilt wird ausschließlich über Links, in denen
 * die ganze Aufgabe steckt (siehe teilen.js).
 * ============================================================ */
(function () {
	"use strict";

	var ENTWURF_SCHLUESSEL = "codehilfe.entwurf";
	var VERZOEGERUNG_MS = 250;

	/* Für "Beispiel laden": klein, zeigt aber Sortieren, eine feste Zeile,
	 * eine Tipplücke, einen Baustein, einen Extra-Baustein und eine
	 * überflüssige Zeile. */
	var BEISPIEL = {
		titel: "Stunden in Minuten",
		aufgabe: "Das Programm soll ausgeben, wie viele Minuten `3` Stunden " +
			"sind. Bringe die Zeilen in die richtige Reihenfolge und fülle die " +
			"Lücken. Eine Zeile wird nicht gebraucht.",
		sprache: "python",
		zeilenSortieren: true,
		zeilenVerschieben: "ueberall",
		lueckenEingabe: "tippen",
		loesung: "nach-fehler",
		code: [
			"stunden = §§3§§",
			"minuten = stunden * §§60::baustein§§",
			"§§24::extra§§",
			"print(stunden)                          §§extra",
			"print(minuten)                          §§fest"
		].join("\n")
	};

	/* Dieselben Muster wie in codehilfe.js */
	var END_MARKER_RE = /[ \t]+§§(fest|extra|gruppe(?:=([A-Za-z0-9_-]+))?)$/;
	var EXTRA_BAUSTEIN_RE = /^§§([\s\S]*?)::extra§§$/;
	var OPTION_RE = /::(baustein|tippen)\s*$/;

	function $(id) {
		return document.getElementById(id);
	}

	var felder = {
		titel: $("feld-titel"),
		aufgabe: $("feld-aufgabe"),
		sprache: $("feld-sprache"),
		code: $("feld-code"),
		sortieren: $("feld-sortieren"),
		verschieben: $("feld-verschieben"),
		eingabe: $("feld-eingabe"),
		loesung: $("feld-loesung")
	};
	var vorschau = $("vorschau");
	var vorschauStatus = $("vorschau-status");
	var werkzeugStatus = $("werkzeug-status");
	var linkSchueler = $("link-schueler");
	var linkEditor = $("link-editor");
	var einbettung = $("einbettung");
	var linkLaenge = $("link-laenge");

	var aktuellerSchuelerLink = "";
	var zeitgeber = null;
	var linkNummer = 0;

	/* ---------- Speicher im Browser ---------- */

	function leseEntwurf() {
		try {
			var text = window.localStorage.getItem(ENTWURF_SCHLUESSEL);
			return text ? CodeHilfeTeilen.bereinige(JSON.parse(text)) : null;
		} catch (fehler) {
			return null;
		}
	}

	function speichereEntwurf(daten) {
		try {
			window.localStorage.setItem(ENTWURF_SCHLUESSEL, JSON.stringify(daten));
		} catch (fehler) {
			/* Ohne Speicher funktioniert der Editor trotzdem. */
		}
	}

	/* ---------- Formular ---------- */

	function liesFormular() {
		return CodeHilfeTeilen.bereinige({
			titel: felder.titel.value,
			aufgabe: felder.aufgabe.value,
			sprache: felder.sprache.value,
			zeilenSortieren: felder.sortieren.checked,
			zeilenVerschieben: felder.verschieben.value,
			lueckenEingabe: felder.eingabe.value,
			loesung: felder.loesung.value,
			code: felder.code.value
		});
	}

	function waehle(select, wert) {
		var vorhanden = Array.prototype.some.call(select.options, function (option) {
			return option.value === wert;
		});
		if (!vorhanden) {
			var option = document.createElement("option");
			option.value = wert;
			option.textContent = wert || "ohne Hervorhebung";
			select.appendChild(option);
		}
		select.value = wert;
	}

	function setzeFormular(daten) {
		felder.titel.value = daten.titel;
		felder.aufgabe.value = daten.aufgabe;
		waehle(felder.sprache, daten.sprache);
		felder.code.value = daten.code;
		felder.sortieren.checked = daten.zeilenSortieren;
		waehle(felder.verschieben, daten.zeilenVerschieben);
		waehle(felder.eingabe, daten.lueckenEingabe);
		waehle(felder.loesung, daten.loesung);
		aktualisiereSperren();
	}

	function aktualisiereSperren() {
		var aktiv = felder.sortieren.checked;
		felder.verschieben.disabled = !aktiv;
		$("einstellung-verschieben").classList.toggle("gesperrt", !aktiv);
	}

	/* ---------- Vorschau und Links ---------- */

	function zeigeVorschau(daten) {
		if (!daten.code.trim()) {
			vorschau.textContent = "";
			var leer = document.createElement("p");
			leer.className = "vorschau-leer";
			leer.textContent = "Füge links den Lösungscode ein. Hier siehst du " +
				"dann die Aufgabe so, wie deine Schülerinnen und Schüler sie sehen. " +
				"Zum Ausprobieren gibt es „Beispiel laden“.";
			vorschau.appendChild(leer);
			setzeStatus("", "");
			return false;
		}
		CodeHilfeAufgabe.zeige(vorschau, daten);
		if (CodeHilfeAufgabe.hatFehler(vorschau)) {
			setzeStatus("fehler", "Noch nicht fertig");
			return false;
		}
		setzeStatus("ok", "Bereit");
		return true;
	}

	function setzeStatus(art, text) {
		vorschauStatus.className = "status-marke" + (art ? " " + art : "");
		vorschauStatus.textContent = text;
		vorschauStatus.hidden = !text;
	}

	function escapeAttribut(text) {
		return text
			.replace(/&/g, "&amp;")
			.replace(/"/g, "&quot;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	}

	function iframeHoehe() {
		var hoehe = vorschau.scrollHeight + 48;
		return Math.max(320, Math.ceil(hoehe / 20) * 20);
	}

	/* Der Bearbeitungslink steht immer bereit, sobald es Code gibt. Schülerlink,
	 * QR-Code und Einbettung erst, wenn die Vorschau keine Fehler zeigt.
	 * kodiert: { aufgabe, bearbeiten } oder null */
	function setzeLinks(kodiert, daten, fertig) {
		var bereit = !!kodiert && fertig;
		var schuelerLink = kodiert ? CodeHilfeTeilen.link("aufgabe.html", kodiert.aufgabe) : "";
		aktuellerSchuelerLink = bereit ? schuelerLink : "";
		linkSchueler.value = aktuellerSchuelerLink;
		linkSchueler.placeholder = kodiert && !fertig
			? "Erst verfügbar, wenn die Vorschau keine Fehler mehr zeigt."
			: "";
		linkEditor.value = kodiert ? CodeHilfeTeilen.link("index.html", kodiert.bearbeiten) : "";
		linkLaenge.textContent = kodiert ? String(schuelerLink.length) : "0";

		if (bereit) {
			var titel = daten.titel.trim() ? "CodeHilfe: " + daten.titel.trim() : "CodeHilfe";
			einbettung.value = '<iframe src="' +
				escapeAttribut(CodeHilfeTeilen.link("aufgabe.html", kodiert.aufgabe, "?einbetten")) +
				'" title="' + escapeAttribut(titel) + '" width="100%" height="' +
				iframeHoehe() + '" style="border: 0;" loading="lazy"></iframe>';
		} else {
			einbettung.value = "";
		}

		Array.prototype.forEach.call(
			document.querySelectorAll("[data-kopiere], #knopf-link-oeffnen, #knopf-qr"),
			function (knopf) {
				knopf.disabled = knopf.dataset.kopiere === "link-editor"
					? !kodiert
					: !bereit;
			}
		);
		$("knopf-speichern").disabled = !daten.code.trim();
	}

	function aktualisiereJetzt() {
		window.clearTimeout(zeitgeber);
		var daten = liesFormular();
		speichereEntwurf(daten);
		var fertig = zeigeVorschau(daten);

		if (!daten.code.trim()) {
			setzeLinks(null, daten, false);
			return;
		}
		var nummer = ++linkNummer;
		Promise.all([
			CodeHilfeTeilen.kodiere(daten),
			CodeHilfeTeilen.kodiere(daten, { bearbeitbar: true })
		]).then(function (kodiert) {
			if (nummer === linkNummer) {
				setzeLinks({ aufgabe: kodiert[0], bearbeiten: kodiert[1] }, daten, fertig);
			}
		}).catch(function (fehler) {
			if (nummer === linkNummer) {
				setzeLinks(null, daten, false);
				meldeWerkzeug(fehler.message, true);
			}
		});
	}

	function aktualisiere() {
		window.clearTimeout(zeitgeber);
		zeitgeber = window.setTimeout(aktualisiereJetzt, VERZOEGERUNG_MS);
	}

	/* ---------- Textfeld bearbeiten ---------- */

	function meldeWerkzeug(text, wichtig) {
		werkzeugStatus.textContent = text;
		werkzeugStatus.classList.toggle("wichtig", !!wichtig);
	}

	/* Ersetzt einen Bereich so, dass Rückgängig (Strg+Z) möglich bleibt. */
	function ersetze(start, ende, text, auswahlStart, auswahlEnde) {
		var feld = felder.code;
		feld.focus();
		feld.setSelectionRange(start, ende);
		var eingefuegt = false;
		try {
			eingefuegt = document.execCommand("insertText", false, text);
		} catch (fehler) {
			eingefuegt = false;
		}
		if (!eingefuegt || feld.value.slice(start, start + text.length) !== text) {
			feld.setRangeText(text, start, ende, "end");
			feld.dispatchEvent(new Event("input", { bubbles: true }));
		}
		feld.setSelectionRange(
			auswahlStart === undefined ? start + text.length : auswahlStart,
			auswahlEnde === undefined ? start + text.length : auswahlEnde
		);
	}

	/* Zeilen, die von der aktuellen Auswahl berührt werden */
	function ausgewaehlteZeilen() {
		var wert = felder.code.value;
		var start = felder.code.selectionStart;
		var ende = felder.code.selectionEnd;
		if (ende > start && wert[ende - 1] === "\n") {
			ende--;
		}
		var zeilen = wert.split("\n");
		var erste = wert.slice(0, start).split("\n").length - 1;
		var letzte = wert.slice(0, ende).split("\n").length - 1;
		return { zeilen: zeilen, erste: erste, letzte: Math.max(erste, letzte) };
	}

	function zeilenAnfang(zeilen, index) {
		var pos = 0;
		for (var i = 0; i < index; i++) {
			pos += zeilen[i].length + 1;
		}
		return pos;
	}

	function zerlegeZeile(zeile) {
		var ohneEndraum = zeile.replace(/\s+$/, "");
		var marker = ohneEndraum.match(END_MARKER_RE);
		if (!marker) {
			return { code: ohneEndraum, marker: null };
		}
		return {
			code: ohneEndraum.slice(0, marker.index).replace(/[ \t]+$/, ""),
			marker: marker[1]
		};
	}

	/* Alle Zeilenmarkierungen in einer gemeinsamen Spalte ausrichten. Der
	 * Abstand vor einer Markierung gehört nicht zum Code (siehe Hilfe). */
	function richteAus(zeilen) {
		var teile = zeilen.map(zerlegeZeile);
		var breite = 0;
		teile.forEach(function (teil) {
			if (!EXTRA_BAUSTEIN_RE.test(teil.code.trim())) {
				breite = Math.max(breite, teil.code.length);
			}
		});
		var spalte = breite + 4;
		return teile.map(function (teil, i) {
			if (!teil.marker) {
				return zeilen[i];
			}
			var abstand = Math.max(1, spalte - teil.code.length);
			return teil.code + new Array(abstand + 1).join(" ") + "§§" + teil.marker;
		});
	}

	function setzeZeilenMarker(marker) {
		var auswahl = ausgewaehlteZeilen();
		var zeilen = auswahl.zeilen.slice();
		var geaendert = 0;

		for (var i = auswahl.erste; i <= auswahl.letzte; i++) {
			var teil = zerlegeZeile(zeilen[i]);
			if (teil.code.trim() === "" || EXTRA_BAUSTEIN_RE.test(teil.code.trim())) {
				continue;
			}
			zeilen[i] = marker ? teil.code + " §§" + marker : teil.code;
			geaendert++;
		}
		if (!geaendert) {
			meldeWerkzeug("Setze den Cursor in eine Codezeile oder markiere mehrere Zeilen.", true);
			return;
		}

		zeilen = richteAus(zeilen);
		var neu = zeilen.join("\n");
		var auswahlStart = zeilenAnfang(zeilen, auswahl.erste);
		var auswahlEnde = zeilenAnfang(zeilen, auswahl.letzte) + zeilen[auswahl.letzte].length;
		ersetze(0, felder.code.value.length, neu, auswahlStart, auswahlEnde);

		if (marker && !felder.sortieren.checked) {
			felder.sortieren.checked = true;
			aktualisiereSperren();
			aktualisiere();
			meldeWerkzeug("Zeilenmarkierungen wirken nur beim Sortieren – " +
				"„Zeilen mischen und sortieren lassen“ ist jetzt eingeschaltet.");
		} else {
			meldeWerkzeug(marker
				? "Markierung §§" + marker + " gesetzt."
				: "Zeilenmarkierung entfernt.");
		}
	}

	/* Lücke an der Cursorposition (ohne Zeilenmarkierung am Ende) */
	function lueckeAmCursor() {
		var wert = felder.code.value;
		var pos = felder.code.selectionStart;
		var anfang = wert.lastIndexOf("\n", pos - 1) + 1;
		var schluss = wert.indexOf("\n", pos);
		if (schluss === -1) {
			schluss = wert.length;
		}
		var zeile = zerlegeZeile(wert.slice(anfang, schluss)).code;
		var muster = /§§([\s\S]*?)§§/g;
		var treffer;
		while ((treffer = muster.exec(zeile)) !== null) {
			var start = anfang + treffer.index;
			var ende = start + treffer[0].length;
			if (pos > start && pos < ende &&
				felder.code.selectionEnd < ende) {
				return { start: start, ende: ende, inhalt: treffer[1] };
			}
		}
		return null;
	}

	function setzeLuecke(option) {
		var feld = felder.code;
		var start = feld.selectionStart;
		var ende = feld.selectionEnd;
		var inhalt;
		var vorhanden = lueckeAmCursor();

		if (vorhanden && (start === ende || (start >= vorhanden.start && ende <= vorhanden.ende))) {
			start = vorhanden.start;
			ende = vorhanden.ende;
			inhalt = vorhanden.inhalt;
		} else {
			inhalt = feld.value.slice(start, ende);
			var schonLuecke = inhalt.match(/^§§([\s\S]*?)§§$/);
			if (schonLuecke) {
				inhalt = schonLuecke[1];
			}
		}
		if (inhalt.indexOf("\n") !== -1) {
			meldeWerkzeug("Eine Lücke muss innerhalb einer Zeile liegen.", true);
			return;
		}

		var antworten = inhalt.replace(OPTION_RE, "").trim() || "antwort";
		var text = "§§" + antworten + (option ? "::" + option : "") + "§§";
		ersetze(start, ende, text, start + 2, start + 2 + antworten.length);

		if (option === "baustein" && antworten.indexOf("§") !== -1) {
			meldeWerkzeug("Ein Baustein hat genau eine Form – entferne die " +
				"Alternativen oder wähle „Lücke“.", true);
		} else if (antworten === "antwort") {
			meldeWerkzeug("Lücke eingefügt – ersetze „antwort“ durch die richtige Lösung.");
		} else {
			meldeWerkzeug(option === "baustein"
				? "Lücke mit Codebaustein gesetzt."
				: (option === "tippen" ? "Lücke zum Tippen gesetzt." : "Lücke gesetzt."));
		}
	}

	function ergaenzeAlternative() {
		var luecke = lueckeAmCursor();
		if (!luecke) {
			meldeWerkzeug("Setze den Cursor in eine Lücke, um eine weitere " +
				"richtige Antwort zu ergänzen.", true);
			return;
		}
		var option = luecke.inhalt.match(OPTION_RE);
		var antworten = option ? luecke.inhalt.slice(0, option.index) : luecke.inhalt;
		var text = "§§" + antworten + "§alternative" + (option ? option[0] : "") + "§§";
		var auswahl = luecke.start + 2 + antworten.length + 1;
		ersetze(luecke.start, luecke.ende, text, auswahl, auswahl + "alternative".length);
		meldeWerkzeug(option && option[1] === "baustein"
			? "Hinweis: Bausteine haben genau eine Form. Alternativen gibt es nur beim Tippen."
			: "Ersetze „alternative“ durch eine weitere richtige Antwort.",
			!!(option && option[1] === "baustein"));
	}

	function fuegeExtraBausteinEin() {
		var wert = felder.code.value;
		var pos = felder.code.selectionEnd;
		var anfang = wert.lastIndexOf("\n", pos - 1) + 1;
		var schluss = wert.indexOf("\n", pos);
		if (schluss === -1) {
			schluss = wert.length;
		}
		var einzug = wert.slice(anfang, schluss).match(/^[ \t]*/)[0];
		var text = (wert.length ? "\n" : "") + einzug + "§§baustein::extra§§";
		var auswahl = schluss + (wert.length ? 1 : 0) + einzug.length + 2;
		ersetze(schluss, schluss, text, auswahl, auswahl + "baustein".length);
		meldeWerkzeug("Extra-Baustein eingefügt – er wird angeboten, aber nicht benötigt.");
	}

	function fragGruppenname() {
		var name = window.prompt(
			"Name der Gruppe (Buchstaben, Ziffern, - und _).\n" +
			"Alle Zeilen mit demselben Namen dürfen ihre Plätze tauschen.", "a");
		if (name === null) {
			return null;
		}
		name = name.trim();
		if (!/^[A-Za-z0-9_-]+$/.test(name)) {
			meldeWerkzeug("Ein Gruppenname darf nur Buchstaben, Ziffern, - und _ enthalten.", true);
			return null;
		}
		return name;
	}

	var werkzeuge = {
		luecke: function () { setzeLuecke(null); },
		baustein: function () { setzeLuecke("baustein"); },
		tippen: function () { setzeLuecke("tippen"); },
		alternative: ergaenzeAlternative,
		"extra-baustein": fuegeExtraBausteinEin,
		fest: function () { setzeZeilenMarker("fest"); },
		gruppe: function () { setzeZeilenMarker("gruppe"); },
		"gruppe-name": function () {
			var name = fragGruppenname();
			if (name) {
				setzeZeilenMarker("gruppe=" + name);
			}
		},
		extra: function () { setzeZeilenMarker("extra"); },
		entfernen: function () { setzeZeilenMarker(null); }
	};

	document.querySelector(".werkzeugleiste").addEventListener("click", function (ereignis) {
		var knopf = ereignis.target.closest("[data-werkzeug]");
		if (knopf && werkzeuge[knopf.dataset.werkzeug]) {
			werkzeuge[knopf.dataset.werkzeug]();
		}
	});

	/* Tab rückt ein. Nach Esc verlässt der nächste Tab das Feld. */
	var tabFrei = false;
	felder.code.addEventListener("keydown", function (ereignis) {
		if (ereignis.key === "Escape") {
			tabFrei = true;
			return;
		}
		if (ereignis.key !== "Tab") {
			if (ereignis.key !== "Shift") {
				tabFrei = false;
			}
			return;
		}
		if (tabFrei || ereignis.ctrlKey || ereignis.altKey || ereignis.metaKey) {
			return;
		}
		ereignis.preventDefault();
		var feld = felder.code;
		var auswahl = ausgewaehlteZeilen();
		var einzeilig = auswahl.erste === auswahl.letzte;
		if (einzeilig && !ereignis.shiftKey) {
			ersetze(feld.selectionStart, feld.selectionEnd, "    ");
			return;
		}
		var zeilen = auswahl.zeilen.slice();
		for (var i = auswahl.erste; i <= auswahl.letzte; i++) {
			if (ereignis.shiftKey) {
				zeilen[i] = zeilen[i].replace(/^( {1,4}|\t)/, "");
			} else if (zeilen[i] !== "") {
				zeilen[i] = "    " + zeilen[i];
			}
		}
		var anfang = zeilenAnfang(auswahl.zeilen, auswahl.erste);
		var altesEnde = zeilenAnfang(auswahl.zeilen, auswahl.letzte) +
			auswahl.zeilen[auswahl.letzte].length;
		var block = zeilen.slice(auswahl.erste, auswahl.letzte + 1).join("\n");
		ersetze(anfang, altesEnde, block, anfang, anfang + block.length);
	});
	felder.code.addEventListener("blur", function () {
		tabFrei = false;
	});

	/* ---------- Kopieren, Öffnen, QR-Code ---------- */

	function kopiere(text, knopf) {
		function bestaetige() {
			var alt = knopf.dataset.text || knopf.textContent;
			knopf.dataset.text = alt;
			knopf.textContent = "Kopiert ✓";
			window.setTimeout(function () {
				knopf.textContent = alt;
			}, 1500);
		}
		function ersatzweise() {
			var hilfsfeld = document.createElement("textarea");
			hilfsfeld.value = text;
			hilfsfeld.setAttribute("readonly", "");
			hilfsfeld.style.position = "fixed";
			hilfsfeld.style.opacity = "0";
			document.body.appendChild(hilfsfeld);
			hilfsfeld.select();
			try {
				document.execCommand("copy");
				bestaetige();
			} catch (fehler) {
				knopf.textContent = "Bitte manuell kopieren";
			}
			hilfsfeld.remove();
		}
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(text).then(bestaetige, ersatzweise);
		} else {
			ersatzweise();
		}
	}

	document.addEventListener("click", function (ereignis) {
		var knopf = ereignis.target.closest("[data-kopiere]");
		if (knopf && !knopf.disabled) {
			var quelle = $(knopf.dataset.kopiere);
			kopiere(quelle.value, knopf);
		}
	});

	Array.prototype.forEach.call(
		document.querySelectorAll(".teilen-zeile input[readonly], #einbettung"),
		function (feld) {
			feld.addEventListener("focus", function () {
				feld.select();
			});
		}
	);

	$("knopf-link-oeffnen").addEventListener("click", function () {
		if (aktuellerSchuelerLink) {
			window.open(aktuellerSchuelerLink, "_blank", "noopener");
		}
	});

	function qrSvg(text) {
		var qr = qrcode(0, "L");
		qr.addData(text);
		qr.make();
		var anzahl = qr.getModuleCount();
		var rand = 4;
		var groesse = anzahl + 2 * rand;
		var pfad = "";
		for (var zeile = 0; zeile < anzahl; zeile++) {
			for (var spalte = 0; spalte < anzahl; spalte++) {
				if (qr.isDark(zeile, spalte)) {
					pfad += "M" + (spalte + rand) + " " + (zeile + rand) + "h1v1h-1z";
				}
			}
		}
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + groesse +
			" " + groesse + '" shape-rendering="crispEdges" role="img" ' +
			'aria-label="QR-Code mit dem Link zur Aufgabe">' +
			'<rect width="100%" height="100%" fill="#fff"/>' +
			'<path fill="#000" d="' + pfad + '"/></svg>';
	}

	function oeffneDialog(dialog) {
		if (typeof dialog.showModal === "function") {
			dialog.showModal();
		} else {
			dialog.setAttribute("open", "");
		}
	}

	function schliesseDialog(dialog) {
		if (typeof dialog.close === "function") {
			dialog.close();
		} else {
			dialog.removeAttribute("open");
		}
	}

	Array.prototype.forEach.call(document.querySelectorAll("dialog"), function (dialog) {
		dialog.addEventListener("click", function (ereignis) {
			if (ereignis.target.closest("[data-schliessen]") || ereignis.target === dialog) {
				schliesseDialog(dialog);
			}
		});
	});

	$("knopf-qr").addEventListener("click", function () {
		var bild = $("qr-bild");
		try {
			bild.innerHTML = qrSvg(aktuellerSchuelerLink);
			$("qr-speichern").disabled = false;
		} catch (fehler) {
			bild.textContent = "Der Link ist zu lang für einen QR-Code. " +
				"Kürze die Aufgabe oder teile den Link direkt.";
			$("qr-speichern").disabled = true;
		}
		$("qr-link").textContent = aktuellerSchuelerLink;
		oeffneDialog($("dialog-qr"));
	});

	function dateiname(daten, endung) {
		var basis = (daten.titel || "codehilfe")
			.toLowerCase()
			.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "codehilfe";
		return basis + endung;
	}

	function biete(dateiinhalt, typ, name) {
		var url = URL.createObjectURL(new Blob([dateiinhalt], { type: typ }));
		var link = document.createElement("a");
		link.href = url;
		link.download = name;
		document.body.appendChild(link);
		link.click();
		link.remove();
		window.setTimeout(function () {
			URL.revokeObjectURL(url);
		}, 1000);
	}

	$("qr-speichern").addEventListener("click", function () {
		var svg = $("qr-bild").querySelector("svg");
		if (svg) {
			biete(svg.outerHTML, "image/svg+xml", dateiname(liesFormular(), "-qr.svg"));
		}
	});

	/* ---------- Datei speichern und öffnen ---------- */

	$("knopf-speichern").addEventListener("click", function () {
		var daten = liesFormular();
		var inhalt = Object.assign({ format: "codehilfe", version: 1 }, daten);
		biete(JSON.stringify(inhalt, null, 2), "application/json",
			dateiname(daten, ".codehilfe.json"));
	});

	var vorherigerEntwurf = null;

	function hatInhalt(daten) {
		return !!(daten.code.trim() || daten.aufgabe.trim() || daten.titel.trim());
	}

	/* Ersetzt die aktuelle Aufgabe. Ein vorhandener Entwurf lässt sich über
	 * die Leiste oberhalb des Editors zurückholen. */
	function ladeAufgabe(daten, hinweis) {
		var bisher = liesFormular();
		if (hatInhalt(bisher) && JSON.stringify(bisher) !== JSON.stringify(daten)) {
			vorherigerEntwurf = bisher;
			$("wiederherstellen-text").textContent = hinweis;
			$("wiederherstellen").hidden = false;
		} else {
			vorherigerEntwurf = null;
			$("wiederherstellen").hidden = true;
		}
		setzeFormular(daten);
		meldeWerkzeug("");
		aktualisiereJetzt();
	}

	$("knopf-beispiel").addEventListener("click", function () {
		ladeAufgabe(CodeHilfeTeilen.bereinige(BEISPIEL), "Das Beispiel wurde geladen.");
	});

	$("entwurf-zurueck").addEventListener("click", function () {
		if (vorherigerEntwurf) {
			setzeFormular(vorherigerEntwurf);
			vorherigerEntwurf = null;
			aktualisiereJetzt();
		}
		$("wiederherstellen").hidden = true;
	});

	$("knopf-oeffnen").addEventListener("click", function () {
		$("eingabe-link").value = "";
		$("oeffnen-fehler").textContent = "";
		oeffneDialog($("dialog-oeffnen"));
		$("eingabe-link").focus();
	});

	/* Der Editor öffnet nur Bearbeitungslinks (siehe teilen.js). */
	function nurBearbeitungslink(ergebnis) {
		if (!ergebnis.bearbeitbar) {
			throw new Error("Das ist ein Schülerlink. Zum Bearbeiten brauchst du " +
				"den Bearbeitungslink oder eine gespeicherte Datei.");
		}
		return ergebnis.daten;
	}

	function zeigeLinkHinweis(text) {
		$("link-hinweis-text").textContent = text;
		$("link-hinweis").hidden = !text;
	}

	$("form-link").addEventListener("submit", function (ereignis) {
		ereignis.preventDefault();
		var text = $("eingabe-link").value.trim();
		var raute = text.indexOf("#");
		CodeHilfeTeilen.dekodiere(raute === -1 ? text : text.slice(raute))
			.then(nurBearbeitungslink)
			.then(function (daten) {
				schliesseDialog($("dialog-oeffnen"));
				zeigeLinkHinweis("");
				ladeAufgabe(daten, "Die Aufgabe aus dem Link wurde geladen.");
			})
			.catch(function (fehler) {
				$("oeffnen-fehler").textContent = fehler.message;
			});
	});

	$("knopf-datei").addEventListener("click", function () {
		$("eingabe-datei").click();
	});

	$("eingabe-datei").addEventListener("change", function () {
		var datei = this.files && this.files[0];
		this.value = "";
		if (!datei) {
			return;
		}
		datei.text().then(function (text) {
			var json = JSON.parse(text);
			if (!json || json.format !== "codehilfe") {
				throw new Error("format");
			}
			schliesseDialog($("dialog-oeffnen"));
			zeigeLinkHinweis("");
			ladeAufgabe(CodeHilfeTeilen.bereinige(json), "Die Datei wurde geladen.");
		}).catch(function () {
			$("oeffnen-fehler").textContent =
				"Diese Datei enthält keine gespeicherte CodeHilfe.";
		});
	});

	$("knopf-neu").addEventListener("click", function () {
		var daten = liesFormular();
		if (hatInhalt(daten) &&
			!window.confirm("Die aktuelle Aufgabe verwerfen und neu beginnen?\n" +
				"Kopiere vorher den Bearbeitungslink, wenn du sie behalten möchtest.")) {
			return;
		}
		$("wiederherstellen").hidden = true;
		zeigeLinkHinweis("");
		setzeFormular(CodeHilfeTeilen.standard());
		meldeWerkzeug("");
		aktualisiereJetzt();
		felder.code.focus();
	});

	/* ---------- Start ---------- */

	Object.keys(felder).forEach(function (name) {
		felder[name].addEventListener("input", aktualisiere);
		felder[name].addEventListener("change", aktualisiere);
	});
	felder.sortieren.addEventListener("change", aktualisiereSperren);

	function ladeAusAdresse() {
		var hash = window.location.hash;
		if (!hash || hash === "#") {
			return Promise.resolve(false);
		}
		return CodeHilfeTeilen.dekodiere(hash).then(nurBearbeitungslink).then(function (daten) {
			zeigeLinkHinweis("");
			ladeAufgabe(daten, "Die Aufgabe aus dem Link wurde geladen.");
			return true;
		}).catch(function (fehler) {
			zeigeLinkHinweis("Der Link konnte nicht geöffnet werden. " + fehler.message);
			return false;
		}).then(function (geladen) {
			/* Der Entwurf übernimmt ab hier; ein Neuladen soll ihn nicht
			 * wieder durch den Link ersetzen. */
			history.replaceState(null, "", window.location.pathname + window.location.search);
			return geladen;
		});
	}

	window.addEventListener("hashchange", ladeAusAdresse);

	setzeFormular(leseEntwurf() || CodeHilfeTeilen.standard());
	ladeAusAdresse().then(function (geladen) {
		if (!geladen) {
			aktualisiereJetzt();
		}
	});
})();
