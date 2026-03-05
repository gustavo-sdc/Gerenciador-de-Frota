import { createContext, useState } from "react"
import Input from "../../components/Input/Input"
import { useNavigate } from "react-router"
import {registerUser} from "../../lib/user"
import { AuthContext } from "../../hooks/authContext"



function Register(){
    const navigate = useNavigate()
    const authContextData = React.useContext(AuthContext)
    
    const [data, setData] = useState({
        email: '',
        password: '',
    })
    const [metaData, setMetaData] = useState({
        cnpj: '',
        nome_empresa: '',
        nome_usuario: ''
    })



    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>{
        setData({...data, [e.target.name]: e.target.value})
    }
    
    const submitNewUser = async (e: React.FormEvent) => {
        e.preventDefault()

        setData({
            email: data.email,
            password: data.password
        })

        setMetaData({
            cnpj: metaData.cnpj,
            nome_empresa: metaData.nome_empresa,
            nome_usuario: metaData.nome_usuario
        })

        
        const register = await registerUser({user: data, metaData: metaData})
        console.log("🚀 ~ submitNewUser ~ register:", register)

        if(register.user?.id){
            authContextData.toggleAuth()
            navigate('/dashboard')
        }
        // if(register.error){
        //     alert(register.error.message)
        // }


    }

    return(
            <main className="bg-blue-700 w-screen h-screen flex flex-col items-center justify-center">

            <h2 className="text-xl font-normal text-gray-300 px-4 text-center">Vamos fazer seu cadastro!</h2>
            <h1 className="text-2xl font-light mb-2 text-gray-300 px-4 text-center">Seja bem vindo ao seu gerenciador de frotas!</h1>

            <form action="submit" className="w-9/11 mt-10">
                <Input label="Email:" name="email" type="email" value={data.email} onChange={handleChange}/>
                <Input label="Password:" name="password" type="password" value={data.password} onChange={handleChange}/>
                <Input label="CNPJ:" name="cnpj" type="text" value={data.cnpj} onChange={handleChange}/>
                <Input label="Nome da empresa:" name="nome_empresa" type="text" value={data.nome_empresa} onChange={handleChange}/>
                <Input label="Nome do responsável:" name="nome_usuario" type="text" value={data.nome_usuario} onChange={handleChange}/>


                <a onClick={() => navigate('/')} className="text-gray-200 text-sm">Login</a>

                <button type="submit" className="bg-black btn p-2 rounded-xl w-full text-gray-300 " onClick={submitNewUser}>Cadastrar-se</button>
            </form>
        </main>
    )
}

export default Register