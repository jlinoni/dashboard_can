from flask import Flask, jsonify, render_template, request
import psycopg2
import json
from collections import Counter

app = Flask(__name__)
conn = psycopg2.connect(
    dbname="postgres",
    user="postgres",
    password="U55tm698$$",
    host="2600:1f1e:75b:4b0b:f03:c0ae:70b4:52ce",
    port="5432"
)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/tendencias/<nivel>")
def tendencias_nivel(nivel):
    plaga = request.args.get("plaga")
    hospedante = request.args.get("hospedante")

    if nivel == "anio":
        date_format = 'YYYY'
    elif nivel == "mes":
        date_format = 'YYYY-MM'
    elif nivel == "dia":
        date_format = 'YYYY-MM-DD'
    else:
        return jsonify([])

    cur = conn.cursor()
    query = f"""
        SELECT TO_CHAR(created_at, '{date_format}') AS periodo, COUNT(*)
        FROM cabi_species
    """
    condiciones = []
    params = []

    if plaga:
        condiciones.append("scientific_name = %s")
        params.append(plaga)
    if hospedante:
        condiciones.append("hosts ILIKE %s")
        params.append(f"%{hospedante}%")

    if condiciones:
        query += " WHERE " + " AND ".join(condiciones)

    query += " GROUP BY periodo ORDER BY periodo"

    cur.execute(query, tuple(params))
    data = [{"periodo": row[0], "total": row[1]} for row in cur.fetchall()]
    return jsonify(data)

@app.route("/api/top-plagas")
def top_plagas():
    cur = conn.cursor()
    cur.execute("""
        SELECT scientific_name, COUNT(*) AS total
        FROM cabi_species
        GROUP BY scientific_name
        ORDER BY total DESC
        LIMIT 10
    """)
    data = [{"nombre": row[0], "total": row[1]} for row in cur.fetchall()]
    return jsonify(data)

@app.route("/api/hosts/<scientific_name>")
def hosts_por_plaga(scientific_name):
    cur = conn.cursor()
    cur.execute("SELECT hosts FROM cabi_species WHERE scientific_name = %s", (scientific_name,))
    all_hosts = []
    for row in cur.fetchall():
        if row[0] and row[0] != "No encontrado":
            all_hosts.extend([h.strip() for h in row[0].split(",")])
    contados = Counter(all_hosts).most_common(15)
    data = [{"nombre": h, "total": c} for h, c in contados]
    return jsonify(data)

@app.route("/api/paises")
def paises():
    plaga = request.args.get("plaga")
    hospedante = request.args.get("hospedante")

    with open("static/data/geo.json") as f:
        geo = json.load(f)

    cur = conn.cursor()
    query = "SELECT distribution FROM cabi_species"
    condiciones = []
    params = []

    if plaga:
        condiciones.append("scientific_name = %s")
        params.append(plaga)
    if hospedante:
        condiciones.append("hosts ILIKE %s")
        params.append(f"%{hospedante}%")

    if condiciones:
        query += " WHERE " + " AND ".join(condiciones)

    cur.execute(query, tuple(params))

    country_count = Counter()
    for row in cur.fetchall():
        if row[0] and row[0] != "No encontrado":
            for country in row[0].split(","):
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
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT scientific_name FROM cabi_species ORDER BY scientific_name")
    data = [row[0] for row in cur.fetchall()]
    return jsonify(data)

@app.route("/api/hospedantes")
def obtener_hospedantes():
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT unnest(string_to_array(hosts, ',')) AS hospedante FROM cabi_species WHERE hosts IS NOT NULL AND hosts != 'No encontrado'")
    data = [row[0].strip() for row in cur.fetchall()]
    return jsonify(sorted(set(data)))

@app.route("/api/contadores")
def obtener_contadores():
    plaga = request.args.get("plaga")
    hospedante = request.args.get("hospedante")
    cur = conn.cursor()

    condiciones = []
    params = []

    if plaga:
        condiciones.append("scientific_name = %s")
        params.append(plaga)
    if hospedante:
        condiciones.append("hosts ILIKE %s")
        params.append(f"%{hospedante}%")

    base_query = "SELECT COUNT(*) FROM cabi_species"
    if condiciones:
        base_query += " WHERE " + " AND ".join(condiciones)

    cur.execute(base_query, tuple(params))
    total_reportes = cur.fetchone()[0]

    if plaga and not hospedante:
        total_plagas = 1
    else:
        query = "SELECT COUNT(DISTINCT scientific_name) FROM cabi_species"
        if hospedante:
            query += " WHERE hosts ILIKE %s"
            cur.execute(query, (f"%{hospedante}%",))
        else:
            cur.execute(query)
        total_plagas = cur.fetchone()[0]

    return jsonify({
        "reportes": total_reportes,
        "plagas": total_plagas
    })

if __name__ == "__main__":
    from waitress import serve
    serve(app, host="0.0.0.0", port=8080)
