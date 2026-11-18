import LogoAnimation from './LogoAnimation'

/** Carga dentro de la app: el logo brindando y un textito abajo */
export default function AppLoading({ text }: { text: string }) {
  return (
    <div className="app-loading" role="status">
      <LogoAnimation size="md" />
      <p className="home-loading">{text}</p>
    </div>
  )
}
