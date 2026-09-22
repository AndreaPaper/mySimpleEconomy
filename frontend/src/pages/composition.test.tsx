import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import ProtectedRoute from '../components/ProtectedRoute'
import SectionsPage from './SectionsPage'
import ImportPage from './ImportPage'
import { mountPage } from '../test/mountPage'
import { setupApiMocks } from '../test/server'

// Le pagine di sola composizione. Qui la profondità è quella che meritano: si
// montano senza esplodere, e per ProtectedRoute si verifica l'unica riga di
// logica che ha — il rimando al login senza token.

setupApiMocks()

describe('ProtectedRoute', () => {
  it('senza token rimanda al login', () => {
    const vista = mountPage(<ProtectedRoute />, {
      route: '/',
      authenticated: false,
      extraRoutes: <Route path="/login" element={<div>Pagina di accesso</div>} />,
    })

    expect(vista.currentPath()).toBe('/login')
    expect(screen.getByText('Pagina di accesso')).toBeInTheDocument()
  })

  it('con token lascia passare il contenuto protetto', () => {
    mountPage(
      <ProtectedRoute />,
      {
        route: '/',
        authenticated: true,
        // Il contenuto protetto è un figlio dell'Outlet: si monta come rotta
        // indice sotto la stessa path.
        extraRoutes: <Route path="/protetto" element={<div>Contenuto protetto</div>} />,
      },
    )

    // Con token, ProtectedRoute rende l'Outlet: nessun rimando al login.
    expect(screen.queryByText('Pagina di accesso')).not.toBeInTheDocument()
  })
})

describe('Sezioni', () => {
  it('si monta e l uscita ripulisce la sessione', async () => {
    const utente = userEvent.setup()
    mountPage(<SectionsPage />, { route: '/sezioni' })

    expect(screen.getByText('Esci')).toBeInTheDocument()
    await utente.click(screen.getByText('Esci'))

    await waitFor(() => expect(localStorage.getItem('token')).toBeNull())
  })
})

describe('Importa', () => {
  it('si monta con il pannello di import', async () => {
    mountPage(<ImportPage />, { route: '/importa' })

    // È un guscio attorno a ImportPanel (già testato a parte): basta che monti.
    expect(await screen.findByText('Diario spese')).toBeInTheDocument()
  })
})
