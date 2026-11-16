import { TERMS, TERMS_DATE } from '../lib/terms'

/** El texto de los términos (se usa en el cartel de entrada y en el perfil) */
export default function TermsContent() {
  return (
    <div className="terms-text">
      {TERMS.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="terms-date">Última actualización: {TERMS_DATE}.</p>
    </div>
  )
}
