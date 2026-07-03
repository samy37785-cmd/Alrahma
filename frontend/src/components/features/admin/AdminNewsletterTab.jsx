export default function AdminNewsletterTab({ subscribers }) {
  return (
    <section className="admin__panel">
      <h2>Newsletter subscribers ({subscribers.length})</h2>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>#</th><th>Email</th><th>Subscribed</th></tr>
          </thead>
          <tbody>
            {subscribers.map((s, i) => (
              <tr key={s._id}>
                <td>{i + 1}</td>
                <td>{s.email}</td>
                <td>{new Date(s.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {subscribers.length === 0 && (
              <tr><td colSpan="3" className="admin__empty">No subscribers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
