import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import { mountPage } from '../test/mountPage'
import { server, setupApiMocks } from '../test/server'

// Accesso e registrazione. Il markup e' un form e basta; quello che vale un
// test e' cosa succede quando le cose vanno storte, perche' e' li' che le due
// pagine si comportano in modo diverso.

setupApiMocks()

const compila = async (utente: ReturnType<typeof userEvent.setup>) => {
  await utente.type(screen.getByLabelText('Email'), 'andrea@example.com')
  // L'etichetta della password differisce fra le due pagine (la registrazione
  // aggiunge "min. 8 caratteri"): si cerca per prefisso.
  await utente.type(screen.getByLabelText(/^Password/), 'password123')
}

describe('accesso', () => {
  it('con credenziali giuste porta alla dashboard', async () => {
    const utente = userEvent.setup()
    const vista = mountPage(<LoginPage />, { route: '/login', authenticated: false })

    await compila(utente)
    await utente.click(screen.getByRole('button', { name: 'Accedi' }))

    await waitFor(() => expect(vista.currentPath()).toBe('/'))
    expect(localStorage.getItem('token')).toBe('tok')
  })

  /**
   * La distinzione che rende utile il messaggio: "credenziali non valide" e
   * "nessuna connessione" mandano l'utente a fare due cose diverse. Dire la
   * prima quando il problema e' la seconda lo fa ridigitare la password che
   * era gia' giusta — con Render addormentato e' proprio quello che capita.
   */
  it('distingue una password sbagliata da un backend che non risponde', async () => {
    const utente = userEvent.setup()
    server.use(http.post('*/api/auth/login', () => new HttpResponse(null, { status: 401 })))
    mountPage(<LoginPage />, { route: '/login', authenticated: false })

    await compila(utente)
    await utente.click(screen.getByRole('button', { name: 'Accedi' }))

    expect(await screen.findByText('Credenziali non valide')).toBeInTheDocument()
  })

  it('senza risposta dal backend lo dice e non parla di credenziali', async () => {
    const utente = userEvent.setup()
    // Qui l'errore di rete e' proprio il punto del test, quindi HttpResponse.error()
    // e' voluto: e' l'unico modo di avere `response === undefined`.
    server.use(http.post('*/api/auth/login', () => HttpResponse.error()))
    mountPage(<LoginPage />, { route: '/login', authenticated: false })

    await compila(utente)
    await utente.click(screen.getByRole('button', { name: 'Accedi' }))

    expect(await screen.findByText(/Nessuna connessione/)).toBeInTheDocument()
    expect(screen.queryByText('Credenziali non valide')).not.toBeInTheDocument()
  })

  it('un accesso fallito non lascia credenziali in memoria', async () => {
    const utente = userEvent.setup()
    server.use(http.post('*/api/auth/login', () => new HttpResponse(null, { status: 401 })))
    const vista = mountPage(<LoginPage />, { route: '/login', authenticated: false })

    await compila(utente)
    await utente.click(screen.getByRole('button', { name: 'Accedi' }))

    await screen.findByText('Credenziali non valide')
    expect(localStorage.getItem('token')).toBeNull()
    expect(vista.currentPath()).toBe('/login')
  })

  // Il pulsante si blocca durante l'invio: e' la guardia contro il doppio click
  // che manderebbe due richieste di accesso.
  it('blocca il pulsante mentre accede', async () => {
    const utente = userEvent.setup()
    let richieste = 0
    server.use(
      http.post('*/api/auth/login', async () => {
        richieste++
        await new Promise((r) => setTimeout(r, 50))
        return HttpResponse.json({ token: 'tok', email: 'a@b.it' })
      }),
    )
    mountPage(<LoginPage />, { route: '/login', authenticated: false })

    await compila(utente)
    const pulsante = screen.getByRole('button', { name: 'Accedi' })
    await utente.click(pulsante)

    expect(await screen.findByRole('button', { name: 'Accesso in corso...' })).toBeDisabled()
    await waitFor(() => expect(richieste).toBe(1))
  })

  it('rimanda alla registrazione', () => {
    mountPage(<LoginPage />, {
      route: '/login',
      authenticated: false,
      extraRoutes: <Route path="/register" element={<div>Pagina di registrazione</div>} />,
    })

    expect(screen.getByRole('link', { name: 'Registrati' })).toHaveAttribute('href', '/register')
  })
})

describe('registrazione', () => {
  it('con dati validi porta alla dashboard', async () => {
    const utente = userEvent.setup()
    const vista = mountPage(<RegisterPage />, { route: '/register', authenticated: false })

    await compila(utente)
    await utente.click(screen.getByRole('button', { name: 'Registrati' }))

    await waitFor(() => expect(vista.currentPath()).toBe('/'))
  })

  /**
   * L'asimmetria con l'accesso, scritta perche' sia visibile invece che
   * scoperta per caso: qui il messaggio e' uno solo, e non distingue il
   * backend irraggiungibile dall'email gia' in uso. Chi si registra mentre
   * Render dorme legge "email gia' in uso" e cambia indirizzo per niente.
   *
   * Il test fissa il comportamento di oggi. Se un domani si decide di
   * allineare le due pagine, fallisce e va aggiornato — consapevolmente.
   */
  it('ha un messaggio unico, che non distingue il backend giu', async () => {
    const utente = userEvent.setup()
    server.use(http.post('*/api/auth/register', () => HttpResponse.error()))
    mountPage(<RegisterPage />, { route: '/register', authenticated: false })

    await compila(utente)
    await utente.click(screen.getByRole('button', { name: 'Registrati' }))

    const messaggio = await screen.findByText(/registrazione/i, { selector: 'p' })
    expect(messaggio).toBeInTheDocument()
    expect(screen.queryByText(/Nessuna connessione/)).not.toBeInTheDocument()
  })

  it('rimanda all accesso', () => {
    mountPage(<RegisterPage />, { route: '/register', authenticated: false })

    expect(screen.getByRole('link', { name: 'Accedi' })).toHaveAttribute('href', '/login')
  })
})
