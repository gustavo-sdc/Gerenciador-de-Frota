import Input from "../../components/Input/Input"
import { useState } from "react"
import { useNavigate } from "react-router"
import { login } from "../../lib/user"
import { AuthContext } from "../../hooks/authContext"
import toast, { Toaster } from 'react-hot-toast';
import React from "react"


function Login(){
    const authContextData = React.useContext(AuthContext)
    const Navigate = useNavigate()
    const [loginError, setLoginError] = useState(false)
    const [user, setUser] = useState({
        email: '',
        password: ''
    })


    const handleChange = (e : React.ChangeEvent<HTMLInputElement>) =>{
        setUser({...user, [e.target.name]: e.target.value})
    }

    const submitLogin = async (e: React.FormEvent) =>{
        e.preventDefault()

        setUser({
            email: user.email,
            password: user.password
        })
        
        
        try {
            
            const submit = await login(user)
            console.log("🚀 ~ submitLogin ~ submit:", submit)

            if(submit.user.role === 'authenticated'){
                authContextData.toggleAuth()
                console.log(" auth: ", authContextData.isAuthenticated)

                authContextData.setUserId(submit.user.id)
                Navigate('/dashboard')
            }

        }catch(e){
            console.log(e)

            toast.error(e.message)

            setLoginError(true)
        }

    }


    return(
        <main className="bg-gradient-to-r from-blue-800 via-blue-500 to-blue-400 text-gray w-screen h-screen flex flex-col items-center justify-center">

            <Toaster /> 

            <h1 className="text-3xl font-regular mb-8 text-gray-200 px-4 text-center max-w-[400px] ">{ loginError ? `Tente novamente!` : `Seja bem vindo ao seu gerenciador de frotas!`}</h1>
            
            <form action="submit" className="w-xs">

                <div className="lg-my-10 sm-my-25">
                    <Input label="Email:" name="email" type="email" value={user.email} onChange={handleChange}/>
                    <Input label="Password:" name="password" type="password" value={user.password} onChange={handleChange}/>

                </div>

                <div className="flex justify-between mb-6">
                    <a onClick={()=> Navigate('/recovery')} className="text-gray-200 text-sm underline">Esqueci minha senha</a>
                    <a href="/register" className="text-gray-200 text-sm">Cadastrar-se</a>
                </div>

                <button type="submit" className="bg-gray-800 btn p-2 rounded-xl w-full text-gray-300 font-bold cursor-pointer" onClick={submitLogin} >Login</button>

            </form>
        </main>
    )
}

export default Login