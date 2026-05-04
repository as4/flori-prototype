import RiveCharacter from './components/RiveCharacter';
import Background from './components/home/Background';
import Header from './components/home/Header';
import Footer from './components/home/Footer';
import './Home.css';

////////////////////////////////////////////////////////////////////////////////

const Home = () => (
  <div className="home fixed inset-0 overflow-hidden bg-[#f7edf0] font-sans">
    <Background/>
    <Header/>

    <div className="absolute inset-0 z-0 flex items-center justify-center pb-20">
      <RiveCharacter currentViseme="sil"/>
    </div>

    <Footer/>
  </div>
);

export default Home;
