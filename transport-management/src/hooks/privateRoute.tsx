import { useContext } from "react"
import { AuthContext } from "./authContext"
import { useNavigate } from "react-router"

function PrivateRoute({ children}: { children: JSX.Element }) {
    const navigate = useNavigate()
    const { isAuthenticated } = useContext(AuthContext)

    return isAuthenticated ? children : <div>You are not logged in</div>
}

export default PrivateRoute