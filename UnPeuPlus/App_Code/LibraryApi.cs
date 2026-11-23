using System;
using System.Collections.Generic;
using System.Data;
using System.Data.OleDb;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;
using System.Web.Script.Serialization;
using System.Web.SessionState;
using System.Xml.Linq;

// ASP.NET Framework 4.8, exécuté en 32 bits pour le pilote Jet de la MDB fournie.
public class LibraryApi : IHttpHandler, IRequiresSessionState
{
    static readonly object WriteLock = new object();
    static readonly Dictionary<string, Attempt> Attempts = new Dictionary<string, Attempt>();
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 131072 };
    HttpContext ctx;
    public bool IsReusable { get { return false; } }
    class Attempt { public int Count; public DateTime Until; }
    class Problem : Exception { public int Status; public Problem(int status, string message) : base(message) { Status = status; } }

    public void ProcessRequest(HttpContext context)
    {
        ctx = context;
        ctx.Response.ContentType = "application/json; charset=utf-8";
        ctx.Response.ContentEncoding = Encoding.UTF8;
        ctx.Response.Cache.SetCacheability(HttpCacheability.NoCache);
        ctx.Response.Cache.SetNoStore();
        ctx.Response.TrySkipIisCustomErrors = true;
        try {
            string action = ctx.Request.QueryString["action"] ?? "catalogue";
            bool write = action == "register" || action == "login" || action == "logout" || action == "order";
            if (write) {
                if (ctx.Request.HttpMethod != "POST") throw new Problem(405, "Cette action nécessite une requête POST.");
                if (ctx.Session["csrf"] == null || ctx.Request.Headers["X-CSRF-Token"] != (string)ctx.Session["csrf"])
                    throw new Problem(403, "Votre session a expiré. Actualisez la page puis réessayez.");
                if (ctx.Request.ContentLength > 65536) throw new Problem(413, "Le formulaire est trop volumineux.");
                if (!(ctx.Request.ContentType ?? "").StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
                    throw new Problem(415, "Le formulaire doit être envoyé au format JSON.");
            } else if (ctx.Request.HttpMethod != "GET") throw new Problem(405, "Méthode non autorisée.");
            object result;
            switch (action) {
                case "catalogue": result = Catalogue(); break;
                case "session": result = SessionInfo(); break;
                case "register": result = Register(Read<Registration>()); break;
                case "login": result = Login(Read<Credentials>()); break;
                case "logout": ctx.Session.Clear(); result = SessionInfo(); break;
                case "order": result = Order(Read<OrderInput>()); break;
                case "orders": result = Orders(); break;
                default: throw new Problem(404, "Cette ressource n’existe pas.");
            }
            ctx.Response.Write(json.Serialize(result));
        } catch (Problem p) { Error(p.Status, p.Message); }
        catch (Exception ex) {
            System.Diagnostics.Trace.TraceError(ex.ToString());
            try { lock (WriteLock) File.AppendAllText(ctx.Server.MapPath("~/App_Data/errors.log"), DateTime.UtcNow.ToString("o") + " " + ex.ToString() + Environment.NewLine); } catch { }
            Error(500, "Une erreur est survenue. Veuillez réessayer. Si elle persiste, vérifiez le lancement du site et la base Access.");
        }
    }
    void Error(int status, string message) { ctx.Response.StatusCode = status; ctx.Response.Write(json.Serialize(new { error = message })); }
    T Read<T>() where T : class {
        try { using (var r = new StreamReader(ctx.Request.InputStream)) { var data = json.Deserialize<T>(r.ReadToEnd()); if (data == null) throw new Exception(); return data; } }
        catch { throw new Problem(400, "Le formulaire est invalide."); }
    }
    OleDbConnection Open() {
        var c = new OleDbConnection("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=" + ctx.Server.MapPath("~/App_Data/librairie.mdb"));
        c.Open(); return c;
    }
    static OleDbCommand Cmd(OleDbConnection c, OleDbTransaction tx, string sql, params object[] args) {
        var cmd = new OleDbCommand(sql, c, tx);
        foreach (object value in args) {
            var p = new OleDbParameter(); p.Value = value ?? DBNull.Value;
            if (value is DateTime) p.OleDbType = OleDbType.Date;
            if (value is decimal) p.OleDbType = OleDbType.Currency;
            cmd.Parameters.Add(p);
        }
        return cmd;
    }
    static List<Dictionary<string, object>> Rows(OleDbConnection c, string sql, params object[] args) {
        using (var cmd = Cmd(c, null, sql, args)) using (var r = cmd.ExecuteReader()) {
            var list = new List<Dictionary<string, object>>();
            while (r.Read()) {
                var row = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                for (int i = 0; i < r.FieldCount; i++) row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
                list.Add(row);
            }
            return list;
        }
    }
    static string Str(object v) { return Convert.ToString(v, CultureInfo.InvariantCulture); }
    static decimal Price(object value) {
        decimal p;
        if (!Decimal.TryParse(Str(value).Replace(',', '.'), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out p) || p < 0)
            throw new Problem(409, "Le prix d’un livre doit être vérifié par la librairie.");
        return p;
    }
    static DateTime Now() { return TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Atlantic Standard Time"); }
    static DateTime Today() { return Now().Date; }
    static string Iso(object date) { return date == null ? null : Convert.ToDateTime(date).ToString("yyyy-MM-dd"); }
    object Catalogue() {
        using (var c = Open()) {
            DateTime today = Today(), cutoff = today.AddMonths(-6);
            var news = Rows(c, "SELECT * FROM nouveautes");
            var books = Rows(c, "SELECT * FROM livres ORDER BY titre").Select(b => {
                var n = news.FirstOrDefault(x => Convert.ToInt32(x["NumLivre"]) == Convert.ToInt32(b["Numlivre"]));
                DateTime? appeared = n == null || n["dateApparution"] == null ? (DateTime?)null : Convert.ToDateTime(n["dateApparution"]);
                DateTime? expiry = n == null || n["dateEcheance"] == null ? (DateTime?)null : Convert.ToDateTime(n["dateEcheance"]);
                return new {
                    id = b["Numlivre"], title = b["titre"], author = b["auteur"], isbn = b["isbn"], publisher = b["edition"],
                    published = Iso(b["anneEdition"]), category = b["categorie"], condition = Str(b["type"]) == "new" ? "Neuf" : "Occasion",
                    price = Price(b["prix"]), stock = Convert.ToInt32(b["quantite"] ?? 0), description = b["description"],
                    newsDate = appeared.HasValue ? Iso(appeared.Value) : null,
                    exclusive = n == null ? null : n["description"],
                    isNew = appeared.HasValue && appeared.Value.Date >= cutoff && appeared.Value.Date <= today && (!expiry.HasValue || expiry.Value.Date >= today)
                };
            }).ToArray();
            var categories = XDocument.Load(ctx.Server.MapPath("~/App_Data/categories.xml")).Root.Elements("categorie")
                .Select(x => new { name = (string)x.Attribute("nom"), icon = (string)x.Attribute("icone"), description = (string)x.Attribute("description") }).ToArray();
            return new { books = books, categories = categories,
                links = Rows(c, "SELECT nomSite, lienSite, description FROM liens ORDER BY NumLiens"), today = Iso(today), cutoff = Iso(cutoff) };
        }
    }
    object SessionInfo() {
        if (ctx.Session["csrf"] == null) ctx.Session["csrf"] = Guid.NewGuid().ToString("N");
        return new { user = ctx.Session["user"], csrf = ctx.Session["csrf"] };
    }
    int UserId() { if (ctx.Session["uid"] == null) throw new Problem(401, "Connectez-vous pour accéder à vos commandes."); return (int)ctx.Session["uid"]; }
    void SetUser(int id, string firstName, string lastName, string login) {
        ctx.Session.Clear();
        ctx.Session["uid"] = id;
        ctx.Session["user"] = new { id = id, firstName = firstName, lastName = lastName, login = login };
        ctx.Session["csrf"] = Guid.NewGuid().ToString("N");
    }
    public class Credentials { public string login { get; set; } public string password { get; set; } }
    public class Registration : Credentials {
        public string firstName { get; set; } public string lastName { get; set; }
        public string street { get; set; } public string city { get; set; } public string province { get; set; }
        public string postalCode { get; set; } public string phone { get; set; }
    }
    static string Required(string value, string label, int max) {
        value = (value ?? "").Trim();
        if (value.Length == 0 || value.Length > max || value.Any(Char.IsControl)) throw new Problem(400, label + " : renseignez une valeur valide (" + max + " caractères maximum).");
        return value;
    }
    static string LoginName(string value) {
        value = (value ?? "").Trim().ToLowerInvariant();
        if (!Regex.IsMatch(value, "^[a-z0-9][a-z0-9._-]{2,39}$")) throw new Problem(400, "Le nom d’utilisateur doit contenir 3 à 40 caractères : lettres, chiffres, point, tiret ou soulignement.");
        return value;
    }
    static string Hash(string password) {
        byte[] salt = new byte[16]; using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(salt);
        using (var kdf = new Rfc2898DeriveBytes(password, salt, 210000, HashAlgorithmName.SHA256))
            return "pbkdf2-sha256$210000$" + Convert.ToBase64String(salt) + "$" + Convert.ToBase64String(kdf.GetBytes(32));
    }
    static bool Verify(string password, string hash) {
        try {
            string[] parts = hash.Split('$'); if (parts.Length != 4 || parts[0] != "pbkdf2-sha256") return false;
            using (var kdf = new Rfc2898DeriveBytes(password, Convert.FromBase64String(parts[2]), Int32.Parse(parts[1]), HashAlgorithmName.SHA256)) {
                byte[] actual = kdf.GetBytes(32), expected = Convert.FromBase64String(parts[3]);
                if (expected.Length != actual.Length) return false;
                int diff = 0; for (int i = 0; i < actual.Length; i++) diff |= actual[i] ^ expected[i]; return diff == 0;
            }
        } catch { return false; }
    }
    static int NextId(OleDbConnection c, OleDbTransaction tx, string table, string column) {
        using (var cmd = Cmd(c, tx, "SELECT MAX([" + column + "]) FROM [" + table + "]")) {
            object v = cmd.ExecuteScalar(); return v == DBNull.Value || v == null ? 1 : Convert.ToInt32(v) + 1;
        }
    }
    object Register(Registration data) {
        string login = LoginName(data.login);
        if (data.password == null || data.password.Length < 10 || data.password.Length > 128) throw new Problem(400, "Choisissez un mot de passe de 10 à 128 caractères.");
        string first = Required(data.firstName, "Prénom", 60), last = Required(data.lastName, "Nom", 60);
        string street = Required(data.street, "Adresse", 100), city = Required(data.city, "Ville", 60);
        string province = Required(data.province, "Province", 2).ToUpperInvariant();
        if (!new[] { "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT" }.Contains(province)) throw new Problem(400, "Choisissez une province ou un territoire valide.");
        string postal = Regex.Replace((data.postalCode ?? "").ToUpperInvariant(), "\\s", "");
        if (!Regex.IsMatch(postal, "^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTVWXYZ][0-9][ABCEGHJ-NPRSTVWXYZ][0-9]$")) throw new Problem(400, "Le code postal canadien est invalide.");
        postal = postal.Insert(3, " ");
        string phone = Regex.Replace(data.phone ?? "", "[^0-9]", "");
        if (phone.Length == 11 && phone[0] == '1') phone = phone.Substring(1);
        if (phone.Length != 10) throw new Problem(400, "Le numéro de téléphone doit contenir 10 chiffres.");
        string hash = Hash(data.password);
        int id;
        lock (WriteLock) using (var c = Open()) using (var tx = c.BeginTransaction()) {
            using (var check = Cmd(c, tx, "SELECT COUNT(*) FROM authentification WHERE [login]=?", login))
                if (Convert.ToInt32(check.ExecuteScalar()) != 0) throw new Problem(409, "Ce nom d’utilisateur est déjà utilisé.");
            id = NextId(c, tx, "clients", "NumClient");
            using (var cmd = Cmd(c, tx, "INSERT INTO clients (NumClient,nom,prenom,rue,ville,province,codePostal,tel,dateInscription) VALUES (?,?,?,?,?,?,?,?,?)", id,last,first,street,city,province,postal,phone,Today())) cmd.ExecuteNonQuery();
            using (var cmd = Cmd(c, tx, "INSERT INTO authentification (NumAuth,[login],[password],Numclient) VALUES (?,?,?,?)", NextId(c,tx,"authentification","NumAuth"),login,hash,id)) cmd.ExecuteNonQuery();
            tx.Commit();
        }
        SetUser(id,first,last,login); return SessionInfo();
    }
    object Login(Credentials data) {
        string login = LoginName(data.login);
        if (data.password == null || data.password.Length > 128) throw new Problem(400, "Renseignez votre mot de passe.");
        string key = ctx.Request.UserHostAddress;
        lock (Attempts) {
            foreach (var k in Attempts.Where(x => x.Value.Until < DateTime.UtcNow).Select(x=>x.Key).ToArray()) Attempts.Remove(k);
            Attempt attempt;
            if (Attempts.TryGetValue(key, out attempt) && attempt.Count >= 10) throw new Problem(429, "Trop de tentatives. Réessayez dans 15 minutes.");
            if (attempt == null) Attempts[key] = attempt = new Attempt { Until = DateTime.UtcNow.AddMinutes(15) };
            attempt.Count++;
        }
        using (var c = Open()) {
            var users = Rows(c,"SELECT a.Numclient,a.[password],c.prenom,c.nom FROM authentification a INNER JOIN clients c ON a.Numclient=c.NumClient WHERE a.[login]=?",login);
            // Un calcul équivalent est effectué pour un compte inconnu.
            string hash = users.Count == 0 ? "pbkdf2-sha256$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" : Str(users[0]["password"]);
            if (!Verify(data.password,hash) || users.Count == 0) throw new Problem(401,"Nom d’utilisateur ou mot de passe incorrect.");
            var u = users[0]; SetUser(Convert.ToInt32(u["Numclient"]),Str(u["prenom"]),Str(u["nom"]),login);
        }
        lock (Attempts) Attempts.Remove(key);
        return SessionInfo();
    }
    public class OrderItem { public int id { get; set; } public int quantity { get; set; } }
    public class OrderInput { public string token { get; set; } public List<OrderItem> items { get; set; } }
    object Order(OrderInput input) {
        int uid = UserId();
        if (!Regex.IsMatch(input.token ?? "", "^[a-zA-Z0-9-]{16,64}$")) throw new Problem(400,"Le numéro de validation est invalide.");
        if (input.items == null || input.items.Count == 0 || input.items.Count > 50 || input.items.Any(i=>i == null || i.id < 1 || i.quantity < 1 || i.quantity > 99) || input.items.Select(i=>i.id).Distinct().Count() != input.items.Count)
            throw new Problem(400,"Votre panier doit contenir de 1 à 50 titres et de 1 à 99 exemplaires par titre.");
        lock (WriteLock) using (var c = Open()) {
            var previous = Rows(c,"SELECT NumCommande,ReferenceCommande,Total FROM commandes_entetes WHERE Jeton=? AND NumClient=?",input.token,uid);
            if (previous.Count > 0) return new { reference = previous[0]["ReferenceCommande"], total = previous[0]["Total"], repeated = true };
            using (var tx = c.BeginTransaction()) {
                int id = NextId(c,tx,"commandes_entetes","NumCommande"), lineId = NextId(c,tx,"commandes","N\u00b0");
                string reference = "UPP-" + Today().ToString("yyyyMMdd") + "-" + id.ToString("D4");
                decimal total = 0;
                var prices = new Dictionary<int,decimal>();
                foreach (var item in input.items) {
                    using (var cmd = Cmd(c,tx,"SELECT titre,prix,quantite FROM livres WHERE Numlivre=?",item.id)) using (var reader = cmd.ExecuteReader()) {
                        if (!reader.Read()) throw new Problem(400,"Un livre de votre panier n’existe plus.");
                        if (Convert.ToInt32(reader["quantite"]) < item.quantity) throw new Problem(409,"Stock insuffisant pour « " + Str(reader["titre"]) + " ». Réduisez la quantité.");
                        prices[item.id] = Price(reader["prix"]); total += prices[item.id] * item.quantity;
                    }
                }
                string address;
                using (var cmd=Cmd(c,tx,"SELECT prenom,nom,rue,ville,province,codePostal FROM clients WHERE NumClient=?",uid)) using(var r=cmd.ExecuteReader()) {
                    if (!r.Read()) throw new Problem(401,"Le compte n’est plus disponible.");
                    address = Str(r[0])+" "+Str(r[1])+", "+Str(r[2])+", "+Str(r[3])+", "+Str(r[4])+" "+Str(r[5]);
                }
                using(var cmd=Cmd(c,tx,"INSERT INTO commandes_entetes (NumCommande,NumClient,ReferenceCommande,Jeton,DateCreation,Total,Adresse,Statut) VALUES (?,?,?,?,?,?,?,?)",id,uid,reference,input.token,Now(),total,address,"Enregistrée")) cmd.ExecuteNonQuery();
                foreach(var item in input.items) {
                    using(var cmd=Cmd(c,tx,"UPDATE livres SET quantite=quantite-? WHERE Numlivre=? AND quantite>=?",item.quantity,item.id,item.quantity))
                        if(cmd.ExecuteNonQuery()!=1) throw new Problem(409,"Le stock a changé. Actualisez votre panier.");
                    using(var cmd=Cmd(c,tx,"INSERT INTO commandes ([N\u00b0],NumLivre,NumClient,dateCommande,dateLivraison,quantites,NumCommande,PrixUnitaire) VALUES (?,?,?,?,?,?,?,?)",lineId++,item.id,uid,Now(),null,item.quantity,id,prices[item.id])) cmd.ExecuteNonQuery();
                }
                tx.Commit(); return new { reference=reference,total=total,repeated=false };
            }
        }
    }
    object Orders() {
        int uid=UserId();
        using(var c=Open()) {
            var client=Rows(c,"SELECT prenom,nom,rue,ville,province,codePostal,tel FROM clients WHERE NumClient=?",uid).FirstOrDefault();
            var headers=Rows(c,"SELECT * FROM commandes_entetes WHERE NumClient=? ORDER BY DateCreation DESC,NumCommande DESC",uid);
            var lines=Rows(c,"SELECT c.NumCommande,c.NumLivre,c.quantites,c.PrixUnitaire,l.titre,l.auteur FROM commandes c INNER JOIN livres l ON c.NumLivre=l.Numlivre WHERE c.NumClient=?",uid);
            return new { profile=client, orders=headers.Select(h=> new { reference=h["ReferenceCommande"],date=Iso(h["DateCreation"]),total=h["Total"],address=h["Adresse"],status=h["Statut"],items=lines.Where(l=>Equals(l["NumCommande"],h["NumCommande"])).Select(l=>new { id=l["NumLivre"],title=l["titre"],author=l["auteur"],quantity=l["quantites"],price=l["PrixUnitaire"] }).ToArray() }).ToArray() };
        }
    }
}
