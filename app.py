from flask import Flask, jsonify, render_template, request
import pandas as pd
import json
from collections import Counter

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/tendencias/<nivel>")
def tendencias_nivel(nivel):
    plaga = request.args.get("plaga")
    hospedante = request.args.get("hospedante")

    niveles_archivo = {
        "anio": "static/data/tendencias_anio.csv",
        "mes": "static/data/tendencias_mes.csv",
        "dia": "static/data/tendencias_dia.csv"
    }

    if nivel not in niveles_archivo:
        return jsonify([])

    df = pd.read_csv(niveles_archivo[nivel])

    if plaga:
        df = df[df["plaga"] == plaga]
    if hospedante:
        df = df[df["hospedante"].str.contains(hospedante, case=False, na=False)]

    data = df.to_dict(orient="records")
    return jsonify(data)

@app.route("/api/top-plagas")
def top_plagas():
    df = pd.read_csv("static/data/top_plagas.csv")
    return jsonify(df.to_dict(orient="records"))

@app.route("/api/hosts/<scientific_name>")
def hosts_por_plaga(scientific_name):
    df = pd.read_csv("static/data/hosts_por_plaga.csv")
    df = df[df["scientific_name"] == scientific_name]

    all_hosts = []
    for hosts in df["hosts"]:
        if pd.notna(hosts) and hosts != "No encontrado":
            all_hosts.extend([h.strip() for h in hosts.split(",")])

    contados = Counter(all_hosts).most_common(15)
    data = [{"nombre": h, "total": c} for h, c in contados]
    return jsonify(data)

@app.route("/api/paises")
def paises():
    plaga = request.args.get("plaga")
    hospedante = request.args.get("hospedante")

    df = pd.read_csv("static/data/distribucion.csv")

    if plaga:
        df = df[df["scientific_name"] == plaga]
    if hospedante:
        df = df[df["hosts"].str.contains(hospedante, case=False, na=False)]

    with open("static/data/geo.json") as f:
        geo = json.load(f)

    country_count = Counter()
    for dist in df["distribution"]:
        if pd.notna(dist) and dist != "No encontrado":
            for country in dist.split(","):
                country_count[country.strip()] += 1

    data = []
    for pais, total in country_count.items():
        coords = geo.get(pais)
        if coords:
            data.append({
                "nombre": pais,
                "total": total,
                "lat": coords["lat"],
                "lng": coords["lng"]
            })
    return jsonify(data)

@app.route("/api/plagas")
def obtener_plagas():
    df = pd.read_csv("static/data/plagas.csv")
    return jsonify(df["scientific_name"].dropna().unique().tolist())

@app.route("/api/hospedantes")
def obtener_hospedantes():
    df = pd.read_csv("static/data/hospedantes.csv")
    return jsonify(df["hospedante"].dropna().unique().tolist())

@app.route("/api/contadores")
def obtener_contadores():
    df = pd.read_csv("static/data/contadores.csv")
    result = df.iloc[0].to_dict()
    return jsonify({"reportes": result["total_reportes"], "plagas": result["total_plagas"]})

if __name__ == "__main__":
    app.run(debug=True)
