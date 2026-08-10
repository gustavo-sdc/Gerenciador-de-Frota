import React, { useState, useContext } from "react"
import Input from "../../components/Input/Input"
import { useNavigate } from "react-router"
import {registerUser} from "../../lib/user"
import { AuthContext } from "../../hooks/authContext"



function Register(){
    const navigate = useNavigate()
    const authContextData = useContext(AuthContext)
    
    // 🔐 Tenant real vindo do contexto
    const auth = useContext(AuthContext);
    const tenant_id = auth.tenantId;
    
    const [data, setData] = useState({
        email: '',
        password: '',
    })
    const [metaData, setMetaData] = useState({
        cnpj: '',
        nome_empresa: '',
        nome_usuario: ''
    })



    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'data' | 'metadata') =>{
        if(type === 'data'){
            setData({...data, [e.target.name]: e.target.value})
        }else{
            setMetaData({...metaData, [e.target.name]: e.target.value})
        }
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

        if(register[0]?.id){

            authContextData.setTenantId(register[0].id)

            authContextData.toggleAuth()
            navigate('/dashboard')
        }


    }

    return(
            <main className="bg-blue-700 w-screen h-full p-5 flex flex-col items-center justify-center">

            <h2 className="text-xl font-normal text-gray-300 px-4 text-center">Vamos fazer seu cadastro!</h2>
            <h1 className="text-2xl font-light mb-2 text-gray-300 px-4 text-center">Seja bem vindo ao seu gerenciador de frotas!</h1>

            <form action="submit" className="w-9/11 mt-10">
                <Input label="Email:" name="email" type="email" value={data.email} onChange={(e) => handleChange(e, 'data') }/>
                <Input label="Password:" name="password" type="password" value={data.password} onChange={(e) => handleChange(e, 'data') }/>
                <Input label="CNPJ:" name="cnpj" type="text" value={metaData.cnpj} onChange={(e) => handleChange(e, 'metadata') }/>
                <Input label="Nome da empresa:" name="nome_empresa" type="text" value={metaData.nome_empresa} onChange={(e) => handleChange(e, 'metadata') }/>
                <Input label="Nome do responsável:" name="nome_usuario" type="text" value={metaData.nome_usuario} onChange={(e) => handleChange(e, 'metadata')  }/>


                <a onClick={() => navigate('/')} className="text-gray-200 text-sm">Login</a>

                <button type="submit" className="bg-black btn p-2 rounded-xl w-full text-gray-300 " onClick={submitNewUser}>Cadastrar-se</button>
            </form>
        </main>
    )
}

export default Register