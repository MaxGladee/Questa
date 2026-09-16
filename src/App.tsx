import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PhoneFrame } from './components/Layout'
import Splash from './screens/Splash'
import Onboarding from './screens/Onboarding'
import Register from './screens/Register'
import Confirm from './screens/Confirm'
import Interests from './screens/Interests'
import Login from './screens/Login'
import Home from './screens/Home'
import Events from './screens/Events'
import MapScreen from './screens/MapScreen'
import Profile from './screens/Profile'
import EventDetails from './screens/EventDetails'
import Chat from './screens/Chat'
import Quest from './screens/Quest'
import CreateEvent from './screens/CreateEvent'

export default function App () {
  return (
    <HashRouter>
      <PhoneFrame>
        <Routes>
          <Route path="/start"      element={<Splash />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/register"   element={<Register />} />
          <Route path="/confirm"    element={<Confirm />} />
          <Route path="/interests"  element={<Interests />} />
          <Route path="/login"      element={<Login />} />

          <Route path="/"        element={<Home />} />
          <Route path="/events"  element={<Events />} />
          <Route path="/map"     element={<MapScreen />} />
          <Route path="/profile" element={<Profile />} />

          <Route path="/create"           element={<CreateEvent />} />
          <Route path="/event/:id"        element={<EventDetails />} />
          <Route path="/event/:id/chat"   element={<Chat />} />
          <Route path="/event/:id/quest"  element={<Quest />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PhoneFrame>
    </HashRouter>
  )
}
