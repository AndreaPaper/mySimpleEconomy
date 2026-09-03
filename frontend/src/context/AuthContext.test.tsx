import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { server, setupApiMocks } from '../test/server'

// La sessione. Due cose meritano un test, e nessuna delle due si vede a schermo:
// dove finiscono le credenziali, e il fatto che l'accesso emetta un evento di
// cui questo file non sa nulla — è quello che sveglia la sincronizzazione
// differita e manda in archivio le spese registrate senza rete.
//
// Usa l'impalcatura condivisa (server + setupApiMocks): il reset del fail-fast
// fra un test e l'altro sta lì, non più ricopiato qui.
setupApiMocks()

const profiloVuoto = {
  nickname: null,
  avatarKey: null,
  salaryDay: null,
  savingsEnabled: false,
  savingsPercent: null,
  defaultSalaryAmount: null,
  salaryCategoryId: null,
}

function Spia() {
  const { token, email, savings, login, register, logout } = useAuth()
  return (
    <div>
      <span data-testid="token">{token ?? '-'}</span>
      <span data-testid="email">{email ?? '-'}</span>
      <span data-testid="risparmio">{savings.enabled ? 'attivo' : 'spento'}</span>
      <span data-testid="stipendio">{savings.defaultSalaryAmount ?? '-'}</span>
      {/* Il rifiuto va raccolto qui: nell'app lo fa la pagina di accesso, che
          mostra il messaggio d'errore. Senza, un accesso fallito diventa una
          promessa rifiutata e non gestita, e vitest la segnala come errore
          del file anche quando tutti i test passano. */}
      <button onClick={() => void login('a@b.it', 'password').catch(() => {})}>Accedi</button>
      <button onClick={() => void register('a@b.it', 'password').catch(() => {})}>Registrati</button>
      <button onClick={logout}>Esci</button>
    </div>
  )
}

const monta = () => render(<AuthProvider><Spia /></AuthProvider>)

const rispondiAccesso = () => {
  server.use(
    http.post('*/api/auth/login', () => HttpResponse.json({ token: 'tok-1', email: 'a@b.it' })),
    http.post('*/api/auth/register', () => HttpResponse.json({ token: 'tok-2', email: 'a@b.it' })),
    http.get('*/api/profile', () => HttpResponse.json(profiloVuoto)),
  )
}

describe('accesso', () => {
  it('salva le credenziali in memoria locale e nello stato', async () => {
    rispondiAccesso()
    monta()

    await userEvent.click(screen.getByText('Accedi'))

    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('tok-1'))
    expect(localStorage.getItem('token')).toBe('tok-1')
    expect(localStorage.getItem('email')).toBe('a@b.it')
  })

  /**
   * L'accoppiamento che non si vede leggendo nessuno dei due file: l'accesso
   * emette {@code auth:login-success}, e OfflineSyncContext lo ascolta per
   * mandare in archivio quello che era rimasto in coda. Togliendo questa riga
   * niente si rompe a schermo — le spese registrate senza rete restano solo lì,
   * in attesa di un evento che non arriverà.
   */
  it('emette l evento che sveglia la sincronizzazione differita', async () => {
    rispondiAccesso()
    const ascoltatore = vi.fn()
    window.addEventListener('auth:login-success', ascoltatore)
    monta()

    await userEvent.click(screen.getByText('Accedi'))

    await waitFor(() => expect(ascoltatore).toHaveBeenCalledTimes(1))
    window.removeEventListener('auth:login-success', ascoltatore)
  })

  /**
   * La registrazione invece <em>non</em> lo emette, ed è corretto: un utente
   * appena creato non ha niente in coda. È scritto qui perché la simmetria fra
   * i due metodi invita a "uniformarli", e l'asimmetria è voluta.
   */
  it('la registrazione non emette l evento, perché non c è nulla da sincronizzare', async () => {
    rispondiAccesso()
    const ascoltatore = vi.fn()
    window.addEventListener('auth:login-success', ascoltatore)
    monta()

    await userEvent.click(screen.getByText('Registrati'))

    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('tok-2'))
    expect(ascoltatore).not.toHaveBeenCalled()
    window.removeEventListener('auth:login-success', ascoltatore)
  })

  it('un accesso fallito non salva nulla', async () => {
    server.use(http.post('*/api/auth/login', () => new HttpResponse(null, { status: 401 })))
    monta()

    await userEvent.click(screen.getByText('Accedi'))

    expect(localStorage.getItem('token')).toBeNull()
    expect(screen.getByTestId('token')).toHaveTextContent('-')
  })
})

describe('il profilo', () => {
  it('viene caricato quando c è un token e riempie le impostazioni', async () => {
    localStorage.setItem('token', 'tok-esistente')
    server.use(
      http.get('*/api/profile', () =>
        HttpResponse.json({
          ...profiloVuoto,
          savingsEnabled: true,
          savingsPercent: 20,
          defaultSalaryAmount: 1885.14,
          salaryCategoryId: 'cat-stipendio',
        }),
      ),
    )

    monta()

    await waitFor(() => expect(screen.getByTestId('risparmio')).toHaveTextContent('attivo'))
    expect(screen.getByTestId('stipendio')).toHaveTextContent('1885.14')
  })

  /**
   * Un profilo che non risponde non deve impedire l'uso dell'app: sono dati di
   * contorno, e il token resta valido. Con Render addormentato è la situazione
   * normale del primo caricamento.
   */
  it('un profilo irraggiungibile non butta giù la sessione', async () => {
    localStorage.setItem('token', 'tok-esistente')
    server.use(http.get('*/api/profile', () => HttpResponse.error()))

    monta()

    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('tok-esistente'))
    expect(screen.getByTestId('risparmio')).toHaveTextContent('spento')
  })

  it('senza token non viene nemmeno richiesto', async () => {
    let richieste = 0
    server.use(
      http.get('*/api/profile', () => {
        richieste++
        return HttpResponse.json(profiloVuoto)
      }),
    )

    monta()

    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('-'))
    expect(richieste).toBe(0)
  })
})

describe('uscita', () => {
  // Non basta togliere il token: le impostazioni del profilo restano in memoria
  // e il prossimo utente della stessa postazione vedrebbe lo stipendio altrui.
  it('ripulisce credenziali e impostazioni del profilo', async () => {
    localStorage.setItem('token', 'tok-esistente')
    server.use(
      http.get('*/api/profile', () =>
        HttpResponse.json({ ...profiloVuoto, savingsEnabled: true, defaultSalaryAmount: 1885.14 }),
      ),
    )
    monta()
    await waitFor(() => expect(screen.getByTestId('risparmio')).toHaveTextContent('attivo'))

    await userEvent.click(screen.getByText('Esci'))

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('email')).toBeNull()
    expect(screen.getByTestId('risparmio')).toHaveTextContent('spento')
    expect(screen.getByTestId('stipendio')).toHaveTextContent('-')
  })
})
